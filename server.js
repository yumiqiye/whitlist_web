const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const cors = require('cors');
const bodyParser = require('body-parser');

// 加载配置文件
const configPath = path.join(__dirname, 'config.yaml');
const config = yaml.load(fs.readFileSync(configPath, 'utf8'));

const app = express();
const PORT = config.server.port;
const HOST = config.server.host;

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 静态文件服务 - 前台
app.use(express.static(path.join(__dirname, 'public')));

// 静态文件服务 - 后台 (/admin)
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// 初始化数据库
const dbPath = config.database.path || './whitelist.db';
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('数据库连接失败:', err.message);
    } else {
        console.log('已连接到 SQLite 数据库');
        initDatabase();
    }
});

function initDatabase() {
    db.run(`
        CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            qq_number TEXT NOT NULL,
            minecraft_id TEXT NOT NULL,
            is_premium BOOLEAN DEFAULT FALSE,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('创建表失败:', err.message);
        } else {
            console.log('数据库表初始化完成');
        }
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS whitelist_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            minecraft_id TEXT NOT NULL UNIQUE,
            qq_number TEXT,
            is_premium BOOLEAN DEFAULT FALSE,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('创建白名单表失败:', err.message);
        } else {
            console.log('白名单表初始化完成');
        }
    });
}

// MCDR Whitelist API 类 (对应 Python 示例)
class WhitelistAPI {
    constructor(apiUrl, token) {
        this.apiUrl = apiUrl;
        this.token = token;
    }

    async getWhitelist() {
        try {
            const response = await axios.get(`${this.apiUrl}/api/whitelist`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            return response.data;
        } catch (error) {
            console.error('获取白名单失败:', error.message);
            return [];
        }
    }

    async getWhitelistUUIDs() {
        try {
            const response = await axios.get(`${this.apiUrl}/api/whitelist/uuids`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            return response.data;
        } catch (error) {
            console.error('获取 UUID 列表失败:', error.message);
            return [];
        }
    }

    async getWhitelistNames() {
        try {
            const response = await axios.get(`${this.apiUrl}/api/whitelist/names`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            return response.data;
        } catch (error) {
            console.error('获取玩家名列表失败:', error.message);
            return [];
        }
    }

    async addPlayer(name) {
        try {
            const response = await axios.post(`${this.apiUrl}/api/whitelist/add`, 
                { player: name },
                { headers: { 'Authorization': `Bearer ${this.token}` } }
            );
            console.log(`已添加玩家 ${name} 到白名单`);
            return response.data;
        } catch (error) {
            console.error(`添加玩家 ${name} 失败:`, error.message);
            throw error;
        }
    }

    async addOfflinePlayer(name) {
        try {
            const response = await axios.post(`${this.apiUrl}/api/whitelist/add_offline`, 
                { player: name },
                { headers: { 'Authorization': `Bearer ${this.token}` } }
            );
            console.log(`已添加离线玩家 ${name} 到白名单`);
            return response.data;
        } catch (error) {
            console.error(`添加离线玩家 ${name} 失败:`, error.message);
            throw error;
        }
    }

    async addOnlinePlayer(name) {
        try {
            const response = await axios.post(`${this.apiUrl}/api/whitelist/add_online`, 
                { player: name },
                { headers: { 'Authorization': `Bearer ${this.token}` } }
            );
            console.log(`已添加正版玩家 ${name} 到白名单`);
            return response.data;
        } catch (error) {
            console.error(`添加正版玩家 ${name} 失败:`, error.message);
            throw error;
        }
    }

    async removePlayer(name) {
        try {
            const response = await axios.post(`${this.apiUrl}/api/whitelist/remove`, 
                { player: name },
                { headers: { 'Authorization': `Bearer ${this.token}` } }
            );
            console.log(`已从白名单移除玩家 ${name}`);
            return response.data;
        } catch (error) {
            console.error(`移除玩家 ${name} 失败:`, error.message);
            throw error;
        }
    }

    async enableWhitelist() {
        try {
            const response = await axios.post(`${this.apiUrl}/api/whitelist/enable`, {},
                { headers: { 'Authorization': `Bearer ${this.token}` } }
            );
            console.log('已开启服务器白名单功能');
            return response.data;
        } catch (error) {
            console.error('开启白名单失败:', error.message);
            throw error;
        }
    }

    async disableWhitelist() {
        try {
            const response = await axios.post(`${this.apiUrl}/api/whitelist/disable`, {},
                { headers: { 'Authorization': `Bearer ${this.token}` } }
            );
            console.log('已关闭服务器白名单功能');
            return response.data;
        } catch (error) {
            console.error('关闭白名单失败:', error.message);
            throw error;
        }
    }

    async addFloodgatePlayer(name, prefix = '') {
        try {
            const playerName = prefix + name;
            const response = await axios.post(`${this.apiUrl}/api/whitelist/add_floodgate`, 
                { player: playerName, prefix: prefix || undefined },
                { headers: { 'Authorization': `Bearer ${this.token}` } }
            );
            console.log(`已添加 Floodgate 玩家 ${playerName} 到白名单`);
            return response.data;
        } catch (error) {
            console.error(`添加 Floodgate 玩家 ${name} 失败:`, error.message);
            throw error;
        }
    }
}

// 初始化 MCDR API
const mcdrConfig = config.mcdr || {};
const whitelistApi = new WhitelistAPI(mcdrConfig.api_url, mcdrConfig.token);

// 邮箱配置
const emailConfig = config.email || {};
let transporter = null;

if (emailConfig.enabled && emailConfig.user && emailConfig.password) {
    transporter = nodemailer.createTransport({
        host: emailConfig.host,
        port: emailConfig.port,
        secure: emailConfig.secure,
        auth: {
            user: emailConfig.user,
            pass: emailConfig.password
        }
    });
    console.log('邮件服务已配置');
} else {
    console.log('邮件服务未配置或禁用');
}

// 发送通知邮件
async function sendApprovalEmail(qqNumber, minecraftId) {
    if (!transporter) {
        console.log('邮件服务未配置，跳过发送邮件');
        return false;
    }

    const qqEmail = `${qqNumber}@qq.com`;
    const mailOptions = {
        from: `"${emailConfig.from_name || 'Minecraft 白名单系统'}" <${emailConfig.user}>`,
        to: qqEmail,
        subject: '✅ 白名单申请已通过',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4CAF50;">🎉 恭喜！您的白名单申请已通过</h2>
                <p>亲爱的玩家：</p>
                <p>您的 Minecraft 白名单申请已成功通过审核！</p>
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <p><strong>QQ 号码：</strong> ${qqNumber}</p>
                    <p><strong>Minecraft ID：</strong> ${minecraftId}</p>
                    <p><strong>审核时间：</strong> ${new Date().toLocaleString('zh-CN')}</p>
                </div>
                <p>现在您可以使用以上账号加入服务器了！</p>
                <p>祝您游戏愉快！</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="color: #999; font-size: 12px;">此邮件由系统自动发送，请勿回复。</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`邮件已发送至：${qqEmail}`);
        return true;
    } catch (error) {
        console.error('邮件发送失败:', error.message);
        return false;
    }
}

// ==================== API 路由 ====================

// 查询 QQ 信息 (模拟，实际需要接入 QQ API)
app.get('/api/qq-info', async (req, res) => {
    const { qq } = req.query;
    if (!qq) {
        return res.status(400).json({ error: '缺少 QQ 号' });
    }

    // 注意：这里需要接入真实的 QQ 信息查询 API
    // 以下为模拟数据
    try {
        // 实际使用时请替换为真实的 QQ 信息查询 API
        const mockData = {
            uin: qq,
            nickname: `用户${qq.slice(-4)}`,
            face: `https://q.qlogo.cn/headimg_dl?dst_uin=${qq}&spec=640`,
            gender: 'unknown',
            age: 0
        };
        res.json(mockData);
    } catch (error) {
        res.status(500).json({ error: '查询失败' });
    }
});

// 查询 MC 皮肤预览 URL
app.get('/api/skin-preview', (req, res) => {
    const { username } = req.query;
    if (!username) {
        return res.status(400).json({ error: '缺少用户名' });
    }

    // 使用 Crafatar 提供的皮肤预览服务
    const skinUrl = `https://crafatar.com/renders/body/${username}?overlay`;
    res.json({ 
        username,
        previewUrl: skinUrl,
        headUrl: `https://crafatar.com/avatars/${username}?overlay&size=128`,
        skinUrl: `https://crafatar.com/skins/${username}?overlay`
    });
});

// 提交白名单申请
app.post('/api/apply', (req, res) => {
    const { qq_number, minecraft_id, is_premium } = req.body;

    if (!qq_number || !minecraft_id) {
        return res.status(400).json({ error: '请填写完整信息' });
    }

    const stmt = db.prepare(
        'INSERT INTO applications (qq_number, minecraft_id, is_premium, status) VALUES (?, ?, ?, ?)'
    );
    
    stmt.run(qq_number, minecraft_id, is_premium ? 1 : 0, 'pending', function(err) {
        if (err) {
            return res.status(500).json({ error: '提交失败', details: err.message });
        }
        res.json({ success: true, id: this.lastID, message: '申请已提交，等待审核' });
    });
    stmt.finalize();
});

// 查询申请状态
app.get('/api/application-status', (req, res) => {
    const { qq } = req.query;
    if (!qq) {
        return res.status(400).json({ error: '缺少 QQ 号' });
    }

    db.get(
        'SELECT * FROM applications WHERE qq_number = ? ORDER BY created_at DESC LIMIT 1',
        [qq],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: '查询失败' });
            }
            if (!row) {
                return res.json({ found: false });
            }
            res.json({ found: true, application: row });
        }
    );
});

// ==================== 后台管理 API ====================

// 获取所有申请
app.get('/api/admin/applications', (req, res) => {
    const { status } = req.query;
    let sql = 'SELECT * FROM applications ORDER BY created_at DESC';
    let params = [];

    if (status) {
        sql = 'SELECT * FROM applications WHERE status = ? ORDER BY created_at DESC';
        params = [status];
    }

    db.all(sql, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: '查询失败' });
        }
        res.json(rows);
    });
});

// 批准申请
app.post('/api/admin/approve/:id', async (req, res) => {
    const { id } = req.params;

    db.get('SELECT * FROM applications WHERE id = ?', [id], async (err, app) => {
        if (err || !app) {
            return res.status(404).json({ error: '申请不存在' });
        }

        try {
            // 调用 MCDR API 添加到白名单
            if (app.is_premium) {
                await whitelistApi.addOnlinePlayer(app.minecraft_id);
            } else {
                await whitelistApi.addPlayer(app.minecraft_id);
            }

            // 添加到本地白名单表
            db.run(
                'INSERT OR REPLACE INTO whitelist_members (minecraft_id, qq_number, is_premium) VALUES (?, ?, ?)',
                [app.minecraft_id, app.qq_number, app.is_premium]
            );

            // 更新申请状态
            db.run(
                'UPDATE applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                ['approved', id]
            );

            // 发送邮件通知
            await sendApprovalEmail(app.qq_number, app.minecraft_id);

            res.json({ success: true, message: '已批准并添加到白名单' });
        } catch (error) {
            res.status(500).json({ error: '批准失败', details: error.message });
        }
    });
});

// 拒绝申请
app.post('/api/admin/reject/:id', (req, res) => {
    const { id } = req.params;

    db.run(
        'UPDATE applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['rejected', id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: '拒绝失败' });
            }
            res.json({ success: true, message: '已拒绝申请' });
        }
    );
});

// 手动添加白名单成员
app.post('/api/admin/whitelist', async (req, res) => {
    const { minecraft_id, qq_number, is_premium } = req.body;

    if (!minecraft_id) {
        return res.status(400).json({ error: '缺少 Minecraft ID' });
    }

    try {
        // 调用 MCDR API
        if (is_premium) {
            await whitelistApi.addOnlinePlayer(minecraft_id);
        } else {
            await whitelistApi.addPlayer(minecraft_id);
        }

        // 添加到本地数据库
        db.run(
            'INSERT OR REPLACE INTO whitelist_members (minecraft_id, qq_number, is_premium) VALUES (?, ?, ?)',
            [minecraft_id, qq_number || '', is_premium ? 1 : 0],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: '添加失败', details: err.message });
                }
                res.json({ success: true, message: '已添加到白名单' });
            }
        );
    } catch (error) {
        res.status(500).json({ error: '添加失败', details: error.message });
    }
});

// 获取白名单成员列表
app.get('/api/admin/whitelist', (req, res) => {
    db.all('SELECT * FROM whitelist_members ORDER BY added_at DESC', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: '查询失败' });
        }
        res.json(rows);
    });
});

// 从白名单移除
app.delete('/api/admin/whitelist/:id', async (req, res) => {
    const { id } = req.params;

    db.get('SELECT * FROM whitelist_members WHERE id = ?', [id], async (err, member) => {
        if (err || !member) {
            return res.status(404).json({ error: '成员不存在' });
        }

        try {
            await whitelistApi.removePlayer(member.minecraft_id);
            
            db.run('DELETE FROM whitelist_members WHERE id = ?', [id], function(err) {
                if (err) {
                    return res.status(500).json({ error: '删除失败' });
                }
                res.json({ success: true, message: '已从白名单移除' });
            });
        } catch (error) {
            res.status(500).json({ error: '移除失败', details: error.message });
        }
    });
});

// 获取统计数据
app.get('/api/admin/stats', (req, res) => {
    const stats = {};
    
    db.get('SELECT COUNT(*) as total FROM applications', [], (err, row) => {
        stats.totalApplications = row ? row.total : 0;
        
        db.get('SELECT COUNT(*) as pending FROM applications WHERE status = ?', ['pending'], (err, row) => {
            stats.pending = row ? row.total : 0;
            
            db.get('SELECT COUNT(*) as approved FROM applications WHERE status = ?', ['approved'], (err, row) => {
                stats.approved = row ? row.total : 0;
                
                db.get('SELECT COUNT(*) as rejected FROM applications WHERE status = ?', ['rejected'], (err, row) => {
                    stats.rejected = row ? row.total : 0;
                    
                    db.get('SELECT COUNT(*) as members FROM whitelist_members', [], (err, row) => {
                        stats.whitelistMembers = row ? row.total : 0;
                        res.json(stats);
                    });
                });
            });
        });
    });
});

// 启动服务器
app.listen(PORT, HOST, () => {
    console.log('========================================');
    console.log(`🚀 服务器已启动`);
    console.log(`📍 地址：http://${HOST}:${PORT}`);
    console.log(`🏠 前台页面：http://${HOST}:${PORT}`);
    console.log(`🔧 后台管理：http://${HOST}:${PORT}/admin`);
    console.log('========================================');
    console.log('\n⚙️  配置文件：config.yaml');
    console.log('💾 数据库文件：', dbPath);
    console.log('========================================');
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n正在关闭服务器...');
    db.close((err) => {
        if (err) {
            console.error('关闭数据库失败:', err.message);
        }
        console.log('数据库连接已关闭');
        process.exit(0);
    });
});
