import { supabase } from './supabaseClient.js';

// -------------------------------------------------------------
// 1. ตรวจสอบ Session เดิม (ถ้าล็อกอินอยู่แล้วให้เด้งไป Dashboard ทันที)
// -------------------------------------------------------------
async function checkExistingSession() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (session && !error) {
            // ล็อกอินค้างไว้อยู่ นำทางไปหน้า Dashboard
            window.location.href = './dashboard.html';
        }
    } catch (err) {
        console.warn('⚠️ เกิดข้อผิดพลาดในการตรวจสอบ Session:', err.message);
    }
}

// -------------------------------------------------------------
// 2. ควบคุมการเข้าสู่ระบบเมื่อกดปุ่มในฟอร์ม
// -------------------------------------------------------------
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('btnLogin');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        return alert('กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน');
    }

    // ล็อกปุ่มป้องกันการกดซ้ำระหว่างรอ Response
    btn.disabled = true;
    btn.innerText = 'กำลังเข้าสู่ระบบ...';

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            throw error;
        }

        // เข้าสู่ระบบสำเร็จ ส่งไปยังหน้า Dashboard
        window.location.href = './dashboard.html';

    } catch (err) {
        console.error('Login Error:', err);
        alert('เข้าสู่ระบบไม่สำเร็จ: อีเมลหรือรหัสผ่านไม่ถูกต้อง');
        btn.disabled = false;
        btn.innerText = 'เข้าสู่ระบบ';
    }
});

// ตรวจสอบ Session ทันทีที่โหลดสคริปต์
checkExistingSession();
