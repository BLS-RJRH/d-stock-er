import { supabase } from './supabaseClient.js';

// ตรวจสอบก่อนว่าล็อกอินอยู่หรือไม่
async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        alert('กรุณาเข้าสู่ระบบก่อนทำการเปลี่ยนรหัสผ่าน');
        window.location.href = './index.html';
    }
}

document.getElementById('resetPasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const btn = document.getElementById('btnSavePassword');

    if (newPassword.length < 6) {
        return alert('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
    }

    if (newPassword !== confirmPassword) {
        return alert('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
    }

    btn.disabled = true;
    btn.innerText = 'กำลังบันทึกรหัสผ่านใหม่...';

    try {
        // 1. อัปเดตรหัสผ่านใหม่ใน Supabase Auth[cite: 7]
        const { data: { user }, error: updateErr } = await supabase.auth.updateUser({
            password: newPassword
        });

        if (updateErr) throw updateErr;

        // 2. ปรับสถานะ is_first_login เป็น false (เพื่อให้ครั้งต่อไปเข้า Dashboard ได้ตรงๆ)[cite: 7]
        const { error: profileErr } = await supabase
            .from('profiles')
            .update({ is_first_login: false })
            .eq('id', user.id);

        if (profileErr) throw profileErr;

        alert('เปลี่ยนรหัสผ่านสำเร็จ!');
        window.location.href = './dashboard.html'; //[cite: 7]

    } catch (err) {
        console.error('Reset Password Error:', err); //[cite: 7]
        alert('เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน: ' + err.message); //[cite: 7]
        btn.disabled = false;
        btn.innerText = 'บันทึกรหัสผ่านใหม่ & เข้าสู่ระบบ'; //[cite: 7]
    }
});

checkSession();
