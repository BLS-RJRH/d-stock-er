import { supabase } from './supabaseClient.js';

const toastSuccess = async (title, text) => {
    await Swal.fire({
        icon: 'success',
        title: title,
        text: text,
        confirmButtonColor: '#10B981',
        customClass: { popup: 'rounded-2xl' }
    });
};

const toastError = (title, text) => {
    Swal.fire({
        icon: 'error',
        title: title,
        text: text,
        confirmButtonColor: '#EF4444',
        customClass: { popup: 'rounded-2xl' }
    });
};

async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        await Swal.fire({
            icon: 'warning',
            title: 'กรุณาเข้าสู่ระบบก่อน',
            text: 'จำเป็นต้องล็อกอินก่อนทำการเปลี่ยนรหัสผ่าน',
            confirmButtonColor: '#DC2626'
        });
        window.location.href = './index.html';
    }
}

document.getElementById('resetPasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const btn = document.getElementById('btnSavePassword');

    if (newPassword.length < 6) {
        return toastError('รหัสผ่านไม่ถูกต้อง', 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
    }

    if (newPassword !== confirmPassword) {
        return toastError('รหัสผ่านไม่ตรงกัน', 'กรุณาตรวจสอบการยืนยันรหัสผ่านอีกครั้ง');
    }

    btn.disabled = true;
    btn.innerText = 'กำลังบันทึกรหัสผ่านใหม่...';

    try {
        const { data: { user }, error: updateErr } = await supabase.auth.updateUser({
            password: newPassword
        });

        if (updateErr) throw updateErr;

        const { error: profileErr } = await supabase
            .from('profiles')
            .update({ is_first_login: false })
            .eq('id', user.id);

        if (profileErr) throw profileErr;

        await toastSuccess('เปลี่ยนรหัสผ่านสำเร็จ! 🎉', 'ระบบจะนำท่านไปยังหน้า Dashboard');
        window.location.href = './dashboard.html';

    } catch (err) {
        console.error('Reset Password Error:', err);
        toastError('เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน', err.message);
        btn.disabled = false;
        btn.innerText = 'บันทึกรหัสผ่านใหม่ & เข้าสู่ระบบ';
    }
});

checkSession();
