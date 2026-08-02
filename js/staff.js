import { supabase } from './supabaseClient.js';

// -------------------------------------------------------------
// 🔒 1. ตรวจสอบสิทธิ์สิทธิ์การเข้าถึง (เฉพาะ Super Admin เท่านั้น)
// -------------------------------------------------------------
async function checkSuperAdminAuth() {
    try {
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession();

        if (sessionErr || !session) {
            alert('กรุณาเข้าสู่ระบบก่อนใช้งาน');
            window.location.href = './index.html';
            return;
        }

        const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .maybeSingle();

        if (profileErr || profile?.role !== 'SUPER_ADMIN') {
            alert('🚫 คุณไม่มีสิทธิ์เข้าถึงหน้าจัดการเจ้าหน้าที่ (สิทธิ์เฉพาะ Super Admin เท่านั้น)');
            window.location.href = './dashboard.html';
            return;
        }

        // ผ่านการตรวจสอบสิทธิ์ ดึงรายการ Staff มาแสดง
        await loadStaffList();

    } catch (err) {
        console.error('Auth Check Error:', err);
        alert('เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์: ' + err.message);
        window.location.href = './dashboard.html';
    }
}

// -------------------------------------------------------------
// 📋 2. ดึงรายชื่อ Staff ทั้งหมดจากตาราง profiles (พร้อม Dropdown แก้ไข Role)
// -------------------------------------------------------------
async function loadStaffList() {
    const tableBody = document.getElementById('staffTableBody');
    const countBadge = document.getElementById('staffCount');

    if (!tableBody) return;

    try {
        const { data: staffList, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (countBadge) countBadge.innerText = `${staffList ? staffList.length : 0} คน`;

        if (!staffList || staffList.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-slate-400">ยังไม่มีรายชื่อเจ้าหน้าที่ในระบบ</td></tr>`;
            return;
        }

        tableBody.innerHTML = staffList.map(staff => {
            return `
                <tr class="hover:bg-slate-50 border-b">
                    <td class="p-3 font-mono text-xs text-slate-500">${staff.staff_code || '-'}</td>
                    <td class="p-3 font-medium text-slate-800">${staff.full_name || 'ไม่ระบุชื่อ'}</td>
                    <td class="p-3">
                        <!-- 🔄 Dropdown เปลี่ยน Role 4 ระดับ -->
                        <select onchange="updateStaffRole('${staff.id}', this.value, '${staff.full_name}')" 
                                class="text-xs font-semibold px-2.5 py-1 rounded-lg border outline-none cursor-pointer transition ${
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
                    <td class="p-3 text-center">
                        <button onclick="deleteStaff('${staff.id}', '${staff.full_name}')" class="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1 rounded-lg border border-red-200 transition active:scale-95">
                            🗑️ ลบ
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error('Load Staff Error:', err);
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-red-500">เกิดข้อผิดพลาดในการดึงข้อมูล: ${err.message}</td></tr>`;
    }
}

// -------------------------------------------------------------
// 🔄 3. ฟังก์ชันเปลี่ยนสิทธิ์ (Role) ของ Staff
// -------------------------------------------------------------
window.updateStaffRole = async (id, newRole, name) => {
    try {
        const { error } = await supabase
            .from('profiles')
            .update({ role: newRole })
            .eq('id', id);

        if (error) throw error;

        alert(`เปลี่ยนสิทธิ์การใช้งานของ "${name}" เรียบร้อยแล้ว`);
        await loadStaffList();

    } catch (err) {
        console.error('Update Role Error:', err);
        alert('เกิดข้อผิดพลาดในการเปลี่ยนสิทธิ์: ' + err.message);
        await loadStaffList();
    }
};

// -------------------------------------------------------------
// ➕ 4. ฟอร์มสร้าง Staff ใหม่
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
        // 1. สร้างบัญชีผู้ใช้ใน Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: fullName,
                    staff_code: staffCode,
                    role: role
                }
            }
        });

        if (authError) throw authError;

        // 2. สร้างข้อมูลลงตาราง profiles โดยตรงทันที (ป้องกันปัญหารอยืนยันอีเมล)
        if (authData.user) {
            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    id: authData.user.id,
                    full_name: fullName,
                    staff_code: staffCode,
                    role: role,
                    is_first_login: true
                });

            if (profileError) console.warn('Profile Insert Notice:', profileError.message);
        }

        alert(`สร้างบัญชีเจ้าหน้าที่ ${fullName} สำเร็จ!\nรหัสผ่านเริ่มต้น: ${password}`);
        
        document.getElementById('createStaffForm').reset();
        document.getElementById('staffPassword').value = 'Abc@1234';
        
        await loadStaffList();

    } catch (err) {
        console.error('Create Staff Error:', err);
        alert('เกิดข้อผิดพลาดในการสร้างบัญชี: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = 'บันทึกข้อมูล Staff';
    }
});

// -------------------------------------------------------------
// 🗑️ 5. ฟังก์ชันลบ Staff ออกจากระบบ
// -------------------------------------------------------------
window.deleteStaff = async (id, name) => {
    if (!confirm(`คุณต้องการลบเจ้าหน้าที่ "${name}" ออกจากระบบใช่หรือไม่?`)) return;

    try {
        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('id', id);

        if (error) throw error;

        alert('ลบเจ้าหน้าที่เรียบร้อยแล้ว');
        await loadStaffList();

    } catch (err) {
        console.error('Delete Staff Error:', err);
        alert('เกิดข้อผิดพลาดในการลบ: ' + err.message);
    }
};

// ตรวจสอบสิทธิ์ Super Admin ทันทีเมื่อโหลดสคริปต์
checkSuperAdminAuth();
