import { supabase } from './supabaseClient.js';

// -------------------------------------------------------------
// 1. ตรวจสอบสิทธิ์ Super Admin
// -------------------------------------------------------------
async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return window.location.href = './index.html';

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

    if (profile?.role !== 'SUPER_ADMIN') {
        alert('🚫 สิทธิ์เฉพาะ Super Admin เท่านั้น');
        return window.location.href = './dashboard.html';
    }

    await loadStaffList();
}

// -------------------------------------------------------------
// 2. โหลดรายชื่อ Staff ทั้งหมด (พร้อมปุ่มบังคับรีเซ็ตรหัสผ่าน)
// -------------------------------------------------------------
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

    tableBody.innerHTML = staffList.map(staff => `
        <tr class="hover:bg-slate-50 border-b">
            <td class="p-3 font-mono text-xs text-slate-500">${staff.staff_code || '-'}</td>
            <td class="p-3 font-medium text-slate-800">${staff.full_name || 'ไม่ระบุชื่อ'}</td>
            <td class="p-3">
                <select onchange="updateStaffRole('${staff.id}', this.value, '${staff.full_name}')" 
                        class="text-xs font-semibold px-2 py-1 rounded-lg border outline-none ${
                            staff.role === 'SUPER_ADMIN' ? 'bg-purple-50 text-purple-700 border-purple-200' :
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
                <!-- 🔑 ปุ่มบังคับรีเซ็ตรหัสผ่าน -->
                <button onclick="forceResetPassword('${staff.id}', '${staff.full_name}')" 
                        title="บังคับเปลี่ยนรหัสผ่านในครั้งถัดไป" 
                        class="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 px-2 py-1 rounded-lg border border-amber-200 transition active:scale-95">
                    🔑 รีเซ็ต
                </button>
                <!-- 🗑️ ปุ่มลบ -->
                <button onclick="deleteStaff('${staff.id}', '${staff.full_name}')" 
                        class="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1 rounded-lg border border-red-200 transition active:scale-95">
                    🗑️ ลบ
                </button>
            </td>
        </tr>
    `).join('');
}

// -------------------------------------------------------------
// 3. เปลี่ยน Role (ส่งเข้า RPC เพื่อ Cast Type)
// -------------------------------------------------------------
window.updateStaffRole = async (id, newRole, name) => {
    const { error } = await supabase.rpc('update_staff_role', {
        p_id: id,
        p_role_str: newRole
    });

    if (error) alert('เปลี่ยนสิทธิ์ไม่สำเร็จ: ' + error.message);
    else { alert(`อัปเดตสิทธิ์ของ "${name}" เรียบร้อยแล้ว`); await loadStaffList(); }
};

// -------------------------------------------------------------
// 🔑 3.5 บังคับรีเซ็ตรหัสผ่านรายบุคคล
// -------------------------------------------------------------
window.forceResetPassword = async (id, name) => {
    if (!confirm(`ต้องการบังคับให้ "${name}" เปลี่ยนรหัสผ่านใหม่ในการเข้าสู่ระบบครั้งถัดไปใช่หรือไม่?`)) return;

    try {
        const { error } = await supabase.rpc('force_reset_password', { p_target_id: id });
        if (error) throw error;

        alert(`ตั้งค่าบังคับเปลี่ยนรหัสผ่านสำหรับ "${name}" เรียบร้อยแล้ว`);
    } catch (err) {
        console.error('Force Reset Error:', err);
        alert('เกิดข้อผิดพลาด: ' + err.message);
    }
};

// -------------------------------------------------------------
// 4. บันทึกสร้าง Staff
// -------------------------------------------------------------
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
        // 1. สร้าง Auth User
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: { full_name: fullName, staff_code: staffCode, role: role }
            }
        });

        if (authError) throw authError;

        // 2. บันทึกลงตาราง profiles ผ่าน RPC เพื่อ Cast เป็น Enum user_role
        if (authData.user) {
            const { error: profileError } = await supabase.rpc('create_staff_profile', {
                p_id: authData.user.id,
                p_full_name: fullName,
                p_staff_code: staffCode,
                p_role_str: role
            });

            if (profileError) throw profileError;
        }

        alert(`สร้างบัญชีเจ้าหน้าที่ ${fullName} สำเร็จ!`);
        document.getElementById('createStaffForm').reset();
        document.getElementById('staffPassword').value = 'Abc@1234';
        await loadStaffList();

    } catch (err) {
        console.error('Create Staff Error:', err);
        alert('เกิดข้อผิดพลาดในการสร้างบัญชี: ' + (err.message || String(err)));
    } finally {
        btn.disabled = false;
        btn.innerText = 'บันทึกข้อมูล Staff';
    }
});

// -------------------------------------------------------------
// 5. ลบ Staff
// -------------------------------------------------------------
window.deleteStaff = async (id, name) => {
    if (!confirm(`ลบเจ้าหน้าที่ "${name}" ใช่หรือไม่?`)) return;
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) alert('ลบไม่สำเร็จ: ' + error.message);
    else await loadStaffList();
};

checkAuth();
