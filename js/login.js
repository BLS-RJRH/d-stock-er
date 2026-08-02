import { supabase } from './supabaseClient.js';

// -------------------------------------------------------------
// 1. ตรวจสอบ Session เดิม (ถ้าล็อกอินอยู่แล้วให้พาไปตามสิทธิ์)
// -------------------------------------------------------------
async function checkExistingSession() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (session && !error) {
            await redirectUserByRole(session.user.id);
        }
    } catch (err) {
        console.warn('⚠️ เกิดข้อผิดพลาดในการตรวจสอบ Session:', err.message);
    }
}

// -------------------------------------------------------------
// 2. ควบคุมการนำทาง (Redirect Flow)
// -------------------------------------------------------------
async function redirectUserByRole(userId) {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, is_first_login')
        .eq('id', userId)
        .maybeSingle();

    if (error || !profile) {
        alert('ไม่พบข้อมูล Profile ผู้ใช้ กรุณาติดต่อ Admin');
        await supabase.auth.signOut();
        return;
    }

    // 🔒 SUPER_ADMIN ข้ามการบังคับเปลี่ยนรหัสผ่านครั้งแรกเสมอ
    if (profile.role === 'SUPER_ADMIN' || profile.is_first_login === false) {
        window.location.href = './dashboard.html';
    } else {
        // 🔑 Staff บทบาทอื่นที่ล็อกอินครั้งแรก -> ไปหน้าตั้งรหัสใหม่
        window.location.href = './reset-password.html';
    }
}

// -------------------------------------------------------------
// 3. ฟอร์ม Login
// -------------------------------------------------------------
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('btnLogin');
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) return alert('กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน');

    btn.disabled = true;
    btn.innerText = 'กำลังเข้าสู่ระบบ...';

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        await redirectUserByRole(data.user.id);

    } catch (err) {
        console.error('Login Error:', err);
        alert('เข้าสู่ระบบไม่สำเร็จ: อีเมลหรือรหัสผ่านไม่ถูกต้อง');
        btn.disabled = false;
        btn.innerText = 'เข้าสู่ระบบ';
    }
});

checkExistingSession();
