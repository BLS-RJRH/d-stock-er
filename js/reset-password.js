import { supabase } from './supabaseClient.js';

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
        // 1. อัปเดตรหัสผ่านใหม่ใน Supabase Auth
        const { data: { user }, error: updateErr } = await supabase.auth.updateUser({
            password: newPassword
        });

        if (updateErr) throw updateErr;

        // 2. ปรับสถานะ is_first_login ในตาราง profiles เป็น false
        const { error: profileErr } = await supabase
            .from('profiles')
            .update({ is_first_login: false })
            .eq('id', user.id);

        if (profileErr) throw profileErr;

        alert('เปลี่ยนรหัสผ่านสำเร็จ!');
        window.location.href = './dashboard.html';

    } catch (err) {
        console.error('Reset Password Error:', err);
        alert('เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน: ' + err.message);
        btn.disabled = false;
        btn.innerText = 'บันทึกรหัสผ่านใหม่ & เข้าสู่ระบบ';
    }
});
