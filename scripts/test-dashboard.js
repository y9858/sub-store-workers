#!/usr/bin/env node
/**
 * Dashboard & SubStore API 冒冒冒冒烟测试
 *
 * 用法:
 *   node scripts/test-dashboard.js [baseUrl]
 *   默认 baseUrl = http://localhost:3000
 *
 * 环境变量:
 *   TEST_ADMIN_USER  管理员用户名 (默认 admin)
 *   TEST_ADMIN_PASS  管理员密码 (默认 admin)
 *   TEST_NEW_PASS    新密码 (默认 TestPass123!)
 */

const BASE = process.argv[2] || 'http://localhost:3000';
const ADMIN_USER = process.env.TEST_ADMIN_USER || 'admin';
let adminPass = process.env.TEST_ADMIN_PASS || 'admin';
const NEW_PASS = process.env.TEST_NEW_PASS || 'TestPass123!';

let failures = 0;

function log(label, ...args) {
    console.log(`[${label}]`, ...args);
}

function fail(label, msg) {
    failures += 1;
    console.error(`[FAIL] [${label}] ${msg}`);
    process.exitCode = 1;
}

function parseCaptchaSvg(svg) {
    const texts = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)];
    return texts.map((m) => m[1]).join('');
}

async function req(path, opts = {}) {
    const url = `${BASE}${path}`;
    const res = await fetch(url, { redirect: 'manual', ...opts });
    let body;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
        body = await res.json();
    } else {
        body = await res.text();
    }
    return { status: res.status, headers: res.headers, body };
}

async function waitUntilReady(maxRetries = 30, intervalMs = 2000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const { status } = await req('/api/dashboard/settings/public');
            if (status === 200) {
                log('WAIT', `服务器就绪 (尝试 ${i + 1}/${maxRetries})`);
                return true;
            }
        } catch {
            // 服务器未就绪
        }
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    fail('WAIT', `服务器未在 ${maxRetries * intervalMs / 1000}s 内就绪`);
    return false;
}

async function getCaptcha() {
    const { status, body } = await req('/api/dashboard/captcha');
    if (status !== 200) {
        fail('CAPTCHA', `HTTP ${status}`);
        return null;
    }
    const code = parseCaptchaSvg(body.svg);
    log('CAPTCHA', `id=${body.id}, code=${code}`);
    return { id: body.id, code };
}

async function login(password) {
    const cap = await getCaptcha();
    if (!cap) return null;
    const { status, body } = await req('/api/dashboard/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: ADMIN_USER,
            password,
            captchaId: cap.id,
            captchaCode: cap.code,
        }),
    });
    if (status !== 200) {
        fail('LOGIN', `HTTP ${status} - ${JSON.stringify(body)}`);
        return null;
    }
    log('LOGIN', `role=${body.role}, mustChangePassword=${body.mustChangePassword}`);
    return body;
}

async function changePassword(token) {
    const { status, body } = await req('/api/dashboard/user/password', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPassword: NEW_PASS }),
    });
    if (status !== 200) {
        fail('CHANGE_PWD', `HTTP ${status} - ${JSON.stringify(body)}`);
        return false;
    }
    log('CHANGE_PWD', '密码修改成功');
    return true;
}

async function main() {
    // 0. 等待服务器就绪
    const ready = await waitUntilReady();
    if (!ready) return;

    // 1. 公开设置
    log('TEST', '获取公开设置...');
    const { status: s1, body: pub } = await req('/api/dashboard/settings/public');
    if (s1 !== 200) return fail('PUBLIC', `HTTP ${s1}`);
    log('PUBLIC', `captchaType=${pub.captchaType || 'builtin'}`);

    // 2. 登录
    log('TEST', `登录 (user=${ADMIN_USER})...`);
    let result = await login(adminPass);
    if (!result) return;

    // 3. 首次登录改密码
    if (result.mustChangePassword) {
        log('TEST', '检测到默认密码，先修改密码...');
        const changed = await changePassword(result.token);
        if (!changed) return;
        adminPass = NEW_PASS;
        log('TEST', '用新密码重新登录...');
        result = await login(adminPass);
        if (!result) return;
    }
    const token = result.token;

    // 4. 认证后访问 user/me
    log('TEST', '获取用户信息...');
    const { status: s4, body: me } = await req('/api/dashboard/user/me', {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (s4 !== 200) return fail('USER_ME', `HTTP ${s4}`);
    log('USER_ME', `username=${me.username}, role=${me.role}`);

    // 5. Admin 获取用户列表
    log('TEST', '获取用户列表...');
    const { status: s5, body: users } = await req('/api/dashboard/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (s5 !== 200) return fail('ADMIN_USERS', `HTTP ${s5}`);
    log('ADMIN_USERS', `用户数=${Array.isArray(users) ? users.length : '?'}`);

    // 6. SubStore API
    const userPath = me?.path || '';
    if (userPath) {
        log('TEST', `SubStore 用户路径: ${userPath}`);
        const { status: s6, body: env } = await req(`/${userPath}/api/utils/env`);
        log('SUBSTORE_ENV', `HTTP ${s6}`, JSON.stringify(env).slice(0, 200));
        if (s6 >= 500) fail('SUBSTORE_ENV', `HTTP ${s6}`);
    } else {
        fail('SUBSTORE', '无法获取用户 substore 路径');
    }

    if (failures > 0) {
        console.log(`\n❌ ${failures} 项测试失败`);
    } else {
        console.log('\n✅ 所有测试通过');
    }
}

main().catch((err) => {
    console.error('[FATAL]', err);
    process.exit(1);
});
