const express = require('express');
const Database = require('better-sqlite3');
const axios = require('axios');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const cors = require('cors');

// 加载配置
const configPath = path.join(__dirname, 'config.yaml');
let config;
try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    config = yaml.load(configContent);
} catch (err) {
    console.error('无法加载配置文件:', err.message);
    process.exit(1);
}

// 初始化数据库
const dbPath = path.resolve(__dirname, config.database.path || './whitelist.db');
const db = new Database(dbPath);

// 创建数据表
db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        qq_number TEXT NOT NULL,
        minecraft_id TEXT NOT NULL,
        is_premium INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        uuid TEXT,
        admin_note TEXT
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS whitelist_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        minecraft_id TEXT NOT NULL UNIQUE,
        uuid TEXT,
        qq_number TEXT,
        is_premium INTEGER DEFAULT 0,
        added_by TEXT DEFAULT 'manual',
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

const app = express();
app.use(cors());
app.use(express.json());

// 后台管理页面路由 (必须在静态文件之前)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// 静态文件服务 - 前台
app.use(express.static(path.join(__dirname, 'public')));

// MCDR API 客户端
const mcdrClient = axios.create({
    baseURL: config.mcdr.url,
    headers: {
        'Authorization': `Bearer ${config.mcdr.token}`,
        'Content-Type': 'application/json'
    },
    timeout: 10000
});

// 邮箱传输器
let transporter = null;
if (config.email.enabled) {
    transporter = nodemailer.createTransport({
        host: config.email.host,
        port: config.email.port,
        secure: true,
        auth: {
            user: config.email.user,
            pass: config.email.pass
        }
    });
}

// ==================== API 路由 ====================

// 获取 QQ 信息 (模拟，实际可接入第三方 API)
app.get('/api/qq-info/:qqNumber', async (req, res) => {
    const { qqNumber } = req.params;
    
    // 这里使用一个公开的 QQ 头像 API 来获取基本信息
    // 实际项目中可以替换为更完善的 API
    try {
        // 返回模拟数据或使用公开 API
        const avatarUrl = `https://q.qlogo.cn/headimg_dl?dst_uin=${qqNumber}&spec=640`;
        
        // 尝试获取昵称 (需要第三方服务，这里返回基础信息)
        res.json({
            success: true,
            qq: qqNumber,
            avatar: avatarUrl,
            nickname: `QQ用户${qqNumber.slice(-4)}`,
            message: 'QQ 信息查询成功'
        });
    } catch (error) {
        res.json({
            success: false,
            message: '查询失败，请检查 QQ 号是否正确'
        });
    }
});

// 获取 MC 皮肤预览 URL
app.get('/api/skin-preview/:minecraftId', (req, res) => {
    const { minecraftId } = req.params;
    const renderUrl = `${config.skin_api.render_url}/${encodeURIComponent(minecraftId)}/64`;
    const bodyUrl = `${config.skin_api.body_url}/${encodeURIComponent(minecraftId)}/200`;
    
    res.json({
        success: true,
        headRender: renderUrl,
        bodyRender: bodyUrl,
        skinUrl: `https://minotar.net/skin/${encodeURIComponent(minecraftId)}`
    });
});

// 提交白名单申请
app.post('/api/apply', (req, res) => {
    const { qq_number, minecraft_id, is_premium } = req.body;
    
    if (!qq_number || !minecraft_id) {
        return res.status(400).json({ success: false, message: '请填写完整信息' });
    }
    
    // 检查是否已存在待审核的申请
    const existing = db.prepare('SELECT * FROM applications WHERE minecraft_id = ? AND status = ?').get(minecraft_id, 'pending');
    if (existing) {
        return res.status(400).json({ success: false, message: '该 Minecraft ID 已有待审核的申请' });
    }
    
    // 检查是否已在白名单中
    const inWhitelist = db.prepare('SELECT * FROM whitelist_members WHERE minecraft_id = ?').get(minecraft_id);
    if (inWhitelist) {
        return res.status(400).json({ success: false, message: '该玩家已在白名单中' });
    }
    
    const stmt = db.prepare(`
        INSERT INTO applications (qq_number, minecraft_id, is_premium, status)
        VALUES (?, ?, ?, 'pending')
    `);
    
    const result = stmt.run(qq_number, minecraft_id, is_premium ? 1 : 0);
    
    res.json({
        success: true,
        message: '申请提交成功，请等待管理员审核',
        application_id: result.lastInsertRowid
    });
});

// 查询申请状态
app.get('/api/application/status/:qqNumber', (req, res) => {
    const { qqNumber } = req.params;
    const applications = db.prepare('SELECT * FROM applications WHERE qq_number = ? ORDER BY created_at DESC').all(qqNumber);
    
    res.json({
        success: true,
        applications: applications
    });
});

// ==================== 后台管理 API ====================

// 获取所有申请
app.get('/api/admin/applications', (req, res) => {
    const { status } = req.query;
    let query = 'SELECT * FROM applications';
    let params = [];
    
    if (status) {
        query += ' WHERE status = ?';
        params.push(status);
    }
    query += ' ORDER BY created_at DESC';
    
    const applications = db.prepare(query).all(...params);
    res.json({ success: true, applications });
});

// 获取白名单成员列表
app.get('/api/admin/whitelist', async (req, res) => {
    try {
        // 从数据库获取
        const localMembers = db.prepare('SELECT * FROM whitelist_members ORDER BY added_at DESC').all();
        
        // 尝试从 MCDR 获取实时白名单
        let mcdrMembers = [];
        try {
            const response = await mcdrClient.get('/api/whitelist');
            if (response.data && response.data.data) {
                mcdrMembers = response.data.data.names || [];
            }
        } catch (e) {
            console.log('MCDR API 调用失败，仅显示本地数据');
        }
        
        res.json({
            success: true,
            localMembers,
            mcdrNames: mcdrMembers
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 批准申请
app.post('/api/admin/approve/:id', async (req, res) => {
    const { id } = req.params;
    const { admin_note } = req.body;
    
    const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
    if (!application) {
        return res.status(404).json({ success: false, message: '申请不存在' });
    }
    
    if (application.status !== 'pending') {
        return res.status(400).json({ success: false, message: '该申请已处理过' });
    }
    
    try {
        // 调用 MCDR API 添加白名单
        let apiSuccess = false;
        let apiMessage = '';
        
        try {
            if (application.is_premium) {
                // 正版玩家
                await mcdrClient.post('/api/whitelist/add_online', {
                    player: application.minecraft_id
                });
            } else {
                // 离线玩家
                await mcdrClient.post('/api/whitelist/add_offline', {
                    player: application.minecraft_id
                });
            }
            apiSuccess = true;
            apiMessage = 'MCDR API 调用成功';
        } catch (mcdrError) {
            console.error('MCDR API 错误:', mcdrError.response?.data || mcdrError.message);
            apiMessage = `MCDR API 调用失败：${mcdrError.message}`;
            // 即使 API 失败也继续，因为可能是测试环境
        }
        
        // 更新申请状态
        db.prepare(`
            UPDATE applications 
            SET status = 'approved', admin_note = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(admin_note || '已通过', id);
        
        // 添加到本地白名单记录
        db.prepare(`
            INSERT OR REPLACE INTO whitelist_members (minecraft_id, qq_number, is_premium, added_by)
            VALUES (?, ?, ?, 'application')
        `).run(application.minecraft_id, application.qq_number, application.is_premium);
        
        // 发送邮件通知
        if (transporter && config.email.enabled) {
            try {
                const qqEmail = `${application.qq_number}@qq.com`;
                await transporter.sendMail({
                    from: `"${config.email.from_name}" <${config.email.user}>`,
                    to: qqEmail,
                    subject: 'Minecraft 白名单申请通过通知',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #4CAF50;">🎉 白名单申请通过!</h2>
                            <p>亲爱的玩家:</p>
                            <p>您的 Minecraft 白名单申请已通过审核!</p>
                            <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                                <p><strong>Minecraft ID:</strong> ${application.minecraft_id}</p>
                                <p><strong>账号类型:</strong> ${application.is_premium ? '正版账号' : '离线账号'}</p>
                                <p><strong>审核时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>
                            </div>
                            <p>现在您可以进入服务器游玩了!</p>
                            <p style="color: #666; font-size: 12px;">如果这不是您申请的，请忽略此邮件。</p>
                        </div>
                    `
                });
            } catch (emailError) {
                console.error('邮件发送失败:', emailError.message);
            }
        }
        
        res.json({
            success: true,
            message: '申请已批准',
            mcdrStatus: apiSuccess ? 'success' : 'warning',
            mcdrMessage: apiMessage
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 拒绝申请
app.post('/api/admin/reject/:id', (req, res) => {
    const { id } = req.params;
    const { admin_note } = req.body;
    
    const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
    if (!application) {
        return res.status(404).json({ success: false, message: '申请不存在' });
    }
    
    db.prepare(`
        UPDATE applications 
        SET status = 'rejected', admin_note = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(admin_note || '已拒绝', id);
    
    res.json({ success: true, message: '申请已拒绝' });
});

// 手动添加白名单成员
app.post('/api/admin/whitelist', async (req, res) => {
    const { minecraft_id, qq_number, is_premium } = req.body;
    
    if (!minecraft_id) {
        return res.status(400).json({ success: false, message: '请填写 Minecraft ID' });
    }
    
    try {
        // 调用 MCDR API
        try {
            if (is_premium) {
                await mcdrClient.post('/api/whitelist/add_online', { player: minecraft_id });
            } else {
                await mcdrClient.post('/api/whitelist/add_offline', { player: minecraft_id });
            }
        } catch (mcdrError) {
            console.error('MCDR API 错误:', mcdrError.message);
        }
        
        // 添加到本地数据库
        db.prepare(`
            INSERT OR REPLACE INTO whitelist_members (minecraft_id, qq_number, is_premium, added_by)
            VALUES (?, ?, ?, 'manual')
        `).run(minecraft_id, qq_number || null, is_premium ? 1 : 0);
        
        res.json({ success: true, message: '玩家已添加到白名单' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 删除白名单成员
app.delete('/api/admin/whitelist/:minecraftId', async (req, res) => {
    const { minecraftId } = req.params;
    
    try {
        // 调用 MCDR API 移除
        try {
            await mcdrClient.post('/api/whitelist/remove', { player: minecraftId });
        } catch (mcdrError) {
            console.error('MCDR API 错误:', mcdrError.message);
        }
        
        // 从本地数据库删除
        db.prepare('DELETE FROM whitelist_members WHERE minecraft_id = ?').run(minecraftId);
        
        res.json({ success: true, message: '玩家已从白名单移除' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 获取统计数据
app.get('/api/admin/stats', (req, res) => {
    const pending = db.prepare("SELECT COUNT(*) as count FROM applications WHERE status = 'pending'").get().count;
    const approved = db.prepare("SELECT COUNT(*) as count FROM applications WHERE status = 'approved'").get().count;
    const rejected = db.prepare("SELECT COUNT(*) as count FROM applications WHERE status = 'rejected'").get().count;
    const totalMembers = db.prepare('SELECT COUNT(*) as count FROM whitelist_members').get().count;
    
    res.json({
        success: true,
        stats: {
            pending,
            approved,
            rejected,
            totalMembers
        }
    });
});

// 启动服务器
const PORT = config.server.port || 11451;
const HOST = config.server.host || '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`\n🚀 Minecraft 白名单系统已启动`);
    console.log(`   前台地址：http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`   后台地址：http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/admin`);
    console.log(`   配置文件：${configPath}`);
    console.log(`   数据库：${dbPath}\n`);
});
