import { supabase } from './supabaseClient.js';

const toastSuccess = (title, text) => {
    Swal.fire({
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

// 1. ตรวจสอบสิทธิ์ Super Admin เข้าใช้งานหน้าจัดการ Staff
async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return window.location.href = './index.html';

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

    if (profile?.role !== 'SUPER_ADMIN') {
        await Swal.fire({
            icon: 'error',
            title: '🚫 ปฏิเสธสิทธิ์การเข้าถึง',
            text: 'หน้านี้อนุญาตเฉพาะ Super Admin เท่านั้น',
            confirmButtonColor: '#EF4444'
        });
        return window.location.href = './dashboard.html';
    }

    await loadStaffList();
}

// 2. โหลดรายชื่อ Staff ทั้งหมด (เพิ่มการ Protect บัญชี Super Admin)
async function loadStaffList() {
    const tableBody = document.getElementById('staffTableBody');
    const countBadge = document.getElementById('staffCount');
    if (!tableBody) return;

    const { data: staffList, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-red-500">Error: ${error.message}</td></tr>`;
        return;
    }

    if (countBadge) countBadge.innerText = `${staffList ? staffList.length : 0} คน`;

    if (!staffList || staffList.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-slate-400">ยังไม่มีรายชื่อเจ้าหน้าที่ในระบบ</td></tr>`;
        return;
    }

    tableBody.innerHTML = staffList.map(staff => {
        const isSuperAdmin = staff.role === 'SUPER_ADMIN';

        return `
            <tr class="hover:bg-slate-50 border-b">
                <td class="p-3 font-mono text-xs text-slate-500">${staff.staff_code || '-'}</td>
                <td class="p-3 font-medium text-slate-800 flex items-center gap-2">
                    ${staff.full_name || 'ไม่ระบุชื่อ'}
                    ${isSuperAdmin ? '<span class="text-[10px] bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full border border-purple-200">🛡️ Protected</span>' : ''}
                </td>
                <td class="p-3">
                    <select onchange="updateStaffRole('${staff.id}', this.value, '${staff.full_name}', '${staff.role}')" 
                            ${isSuperAdmin ? 'disabled title="บัญชี Super Admin ไม่สามารถเปลี่ยนสิทธิ์ได้"' : ''}
                            class="text-xs font-semibold px-2 py-1 rounded-lg border outline-none ${
                                isSuperAdmin ? 'bg-purple-100 text-purple-800 border-purple-300 cursor-not-allowed opacity-80' :
                                staff.role === 'ADMIN' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                                staff.role === 'CENTER_STAFF' ? 'bg-red-50 text-red-700 border-red-200' :
                                'bg-blue-50 text-blue-700 border-blue-200'
                            }">
                        <option value="SUB_STAFF" ${staff.role === 'SUB_STAFF' ? 'selected' : ''}>🩺 Sub Staff</option>
                        <option value="CENTER_STAFF" ${staff.role === 'CENTER_STAFF' ? 'selected' : ''}>📦 Center Staff</option>
                        <option value="ADMIN" ${staff.role === 'ADMIN' ? 'selected' : ''}>🛡️ Admin</option>
                        <option value="SUPER_ADMIN" ${staff.role === 'SUPER_ADMIN' ? 'selected' : ''}>👑 Super Admin</option>
                    </select>
                </td>
                <td class="p-3 text-center space-x-1">
                    ${isSuperAdmin ? `
                        <span class="text-xs text-slate-400 font-medium italic">🔒 ห้ามแก้ไข</span>
                    ` : `
                        <button onclick="forceResetPassword('${staff.id}', '${staff.full_name}', '${staff.role}')" 
                                title="รีเซ็ตรหัสผ่านกลับเป็นค่าเริ่มต้น Abc@1234" 
                                class="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 px-2 py-1 rounded-lg border border-amber-200 transition active:scale-95">
                            🔑 รีเซ็ต
                        </button>
                        <button onclick="deleteStaff('${staff.id}', '${staff.full_name}', '${staff.role}')" 
                                class="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1 rounded-lg border border-red-200 transition active:scale-95">
                            🗑️ ลบ
                        </button>
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

// 3. ป้องกันการอัปเดตสิทธิ์ของ Super Admin
window.updateStaffRole = async (id, newRole, name, currentRole) => {
    if (currentRole === 'SUPER_ADMIN') {
        toastError('ปฏิเสธการดำเนินการ', 'ไม่สามารถเปลี่ยนแปลงสิทธิ์ของ Super Admin ได้');
        await loadStaffList();
        return;
    }

    const { error } = await supabase.rpc('update_staff_role', {
        p_id: id,
        p_role_str: newRole
    });

    if (error) toastError('เปลี่ยนสิทธิ์ไม่สำเร็จ', error.message);
    else { toastSuccess('อัปเดตสิทธิ์สำเร็จ', `ปรับสิทธิ์การใช้งานของ "${name}" เรียบร้อยแล้ว`); await loadStaffList(); }
};

// 3.5 ป้องกันการรีเซ็ตรหัสผ่านของ Super Admin
window.forceResetPassword = async (id, name, role) => {
    if (role === 'SUPER_ADMIN') {
        return toastError('ปฏิเสธการดำเนินการ', 'ไม่สามารถรีเซ็ตรหัสผ่านของบัญชี Super Admin ได้');
    }

    const confirmRes = await Swal.fire({
        title: 'รีเซ็ตรหัสผ่านเป็นค่าเริ่มต้น?',
        text: `ต้องการรีเซ็ตรหัสผ่านของ "${name}" กลับเป็น "Abc@1234" ใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#F59E0B',
        cancelButtonColor: '#94A3B8',
        confirmButtonText: 'ยืนยันรีเซ็ตรหัสผ่าน',
        cancelButtonText: 'ยกเลิก',
        customClass: { popup: 'rounded-2xl' }
    });

    if (!confirmRes.isConfirmed) return;

    try {
        const { error } = await supabase.rpc('admin_reset_user_password', { 
            p_target_id: id,
            p_default_password: 'Abc@1234'
        });

        if (error) throw error;

        await Swal.fire({
            icon: 'success',
            title: 'รีเซ็ตรหัสผ่านสำเร็จ! 🔑',
            html: `รีเซ็ตรหัสผ่านของ <b>${name}</b> เรียบร้อยแล้ว<br><br><span class="text-sm bg-slate-100 text-slate-800 px-3 py-1.5 rounded-xl font-mono border border-slate-200 inline-block">รหัสผ่านใหม่: Abc@1234</span>`,
            confirmButtonColor: '#10B981',
            customClass: { popup: 'rounded-2xl' }
        });

    } catch (err) {
        console.error('Reset Password Error:', err);
        toastError('เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน', err.message);
    }
};

// 4. บันทึกสร้าง Staff
document.getElementById('createStaffForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSaveStaff');
    
    const staffCode = document.getElementById('staffCode').value.trim();
    const fullName = document.getElementById('fullName').value.trim();
    const email = document.getElementById('staffEmail').value.trim();
    const password = document.getElementById('staffPassword').value;
    const role = document.getElementById('staffRole').value;

    btn.disabled = true;
    btn.innerText = 'กำลังบันทึกข้อมูล...';

    try {
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: { full_name: fullName, staff_code: staffCode, role: role }
            }
        });

        if (authError) throw authError;

        if (authData.user) {
            const { error: profileError } = await supabase.rpc('create_staff_profile', {
                p_id: authData.user.id,
                p_full_name: fullName,
                p_staff_code: staffCode,
                p_role_str: role
            });

            if (profileError) throw profileError;
        }

        toastSuccess('สร้างบัญชีสำเร็จ! 🎉', `เพิ่มบัญชีเจ้าหน้าที่ ${fullName} เรียบร้อยแล้ว`);
        document.getElementById('createStaffForm').reset();
        document.getElementById('staffPassword').value = 'Abc@1234';
        await loadStaffList();

    } catch (err) {
        console.error('Create Staff Error:', err);
        toastError('เกิดข้อผิดพลาดในการสร้างบัญชี', err.message || String(err));
    } finally {
        btn.disabled = false;
        btn.innerText = 'บันทึกข้อมูล Staff';
    }
});

// 5. ป้องกันการลบบัญชี Super Admin
window.deleteStaff = async (id, name, role) => {
    if (role === 'SUPER_ADMIN') {
        return toastError('ปฏิเสธการดำเนินการ', 'บัญชี Super Admin ได้รับการคุ้มครอง ห้ามลบเด็ดขาด');
    }

    const confirmRes = await Swal.fire({
        title: 'ยืนยันลบเจ้าหน้าที่?',
        text: `ต้องการลบรายชื่อ "${name}" ออกจากระบบใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#94A3B8',
        confirmButtonText: 'ลบเจ้าหน้าที่',
        cancelButtonText: 'ยกเลิก',
        customClass: { popup: 'rounded-2xl' }
    });

    if (!confirmRes.isConfirmed) return;

    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) toastError('ลบไม่สำเร็จ', error.message);
    else { toastSuccess('ลบเรียบร้อย', `ลบเจ้าหน้าที่ "${name}" สำเร็จ`); await loadStaffList(); }
};

checkAuth();
