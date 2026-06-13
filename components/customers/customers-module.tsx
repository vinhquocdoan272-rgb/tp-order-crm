"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { Download, Eye, RefreshCcw, Save, Search } from "lucide-react";
import type { UserRole } from "@/lib/types/database";
import { CUSTOMER_TYPES, ROLE_LABELS } from "@/lib/constants/app";
import { customerSchema } from "@/lib/validations/schemas";
import { exportToExcel } from "@/lib/export/excel";
import { createClient } from "@/lib/supabase/browser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type BranchOption = { id: string; name: string };
type StaffOption = { id: string; full_name: string; role: UserRole; branch_id: string | null };

type CustomerRow = {
  id: string;
  customer_code: string;
  name: string;
  phone: string;
  address: string | null;
  customer_type: string;
  branch_id: string | null;
  assigned_staff_id: string | null;
  created_by: string | null;
  note: string | null;
  created_at: string;
  branches?: { name: string | null } | null;
  assigned_staff?: { full_name: string | null; role: UserRole | null } | null;
};

type FormState = {
  name: string;
  phone: string;
  address: string;
  customer_type: string;
  branch_id: string;
  assigned_staff_id: string;
  note: string;
};

const initialForm: FormState = {
  name: "",
  phone: "",
  address: "",
  customer_type: "Cá nhân",
  branch_id: "",
  assigned_staff_id: "",
  note: "",
};

function staffLabel(staff: Pick<StaffOption, "full_name" | "role">) {
  return `${staff.full_name} - ${ROLE_LABELS[staff.role]}`;
}

export function CustomersModule({ role, branchId, userId }: { role: UserRole; branchId: string | null; userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const isFieldStaff = role === "field_staff";
  const canManage = role === "admin" || role === "branch_manager" || isFieldStaff;
  const canUseBranchFilter = role === "admin";
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState(role === "branch_manager" || role === "field_staff" ? branchId ?? "" : "");
  const [typeFilter, setTypeFilter] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  const [form, setForm] = useState<FormState>({
    ...initialForm,
    branch_id: role === "branch_manager" || role === "field_staff" ? branchId ?? "" : "",
    assigned_staff_id: role === "field_staff" ? userId : "",
  });
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");

    const [customersResult, branchesResult, staffResult] = await Promise.all([
      supabase
        .from("customers")
        .select("id, customer_code, name, phone, address, customer_type, branch_id, assigned_staff_id, created_by, note, created_at, branches(name), assigned_staff:profiles!customers_assigned_staff_id_fkey(full_name, role)")
        .order("created_at", { ascending: false }),
      supabase.from("branches").select("id, name").order("name"),
      supabase.from("profiles").select("id, full_name, role, branch_id").eq("is_active", true).order("full_name"),
    ]);

    setLoading(false);

    const firstError = customersResult.error ?? branchesResult.error ?? staffResult.error;
    if (firstError) {
      setError(firstError.message);
      return;
    }

    const branchRows = (branchesResult.data ?? []) as BranchOption[];
    setCustomers((customersResult.data ?? []) as unknown as CustomerRow[]);
    setBranches(branchRows);
    setStaff((staffResult.data ?? []) as StaffOption[]);

    if (role === "admin" && !form.branch_id && branchRows[0]) {
      setForm((current) => ({ ...current, branch_id: branchRows[0].id }));
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const currentBranchId = role === "branch_manager" || role === "field_staff" ? branchId ?? "" : form.branch_id;
  const staffOptions = staff.filter((profile) => {
    if (role === "field_staff") return profile.id === userId;
    if (role === "branch_manager") return profile.branch_id === branchId;
    if (!currentBranchId) return true;
    return profile.branch_id === currentBranchId || profile.role === "admin";
  });

  const filteredCustomers = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return customers.filter((customer) => {
      const matchesQuery =
        !keyword ||
        customer.name.toLowerCase().includes(keyword) ||
        customer.phone.toLowerCase().includes(keyword) ||
        customer.customer_code.toLowerCase().includes(keyword) ||
        String(customer.assigned_staff?.full_name ?? "").toLowerCase().includes(keyword);
      const matchesBranch = !branchFilter || customer.branch_id === branchFilter;
      const matchesType = !typeFilter || customer.customer_type === typeFilter;
      const matchesStaff = !staffFilter || customer.assigned_staff_id === staffFilter;
      return matchesQuery && matchesBranch && matchesType && matchesStaff;
    });
  }, [customers, query, branchFilter, typeFilter, staffFilter]);

  async function exportCustomers() {
    await exportToExcel("khach-hang", "Khách hàng", [
      { header: "Mã KH", key: "Mã KH", width: 14 },
      { header: "Tên khách hàng", key: "Tên khách hàng", width: 28 },
      { header: "Số điện thoại", key: "Số điện thoại", width: 18 },
      { header: "Địa chỉ", key: "Địa chỉ", width: 32 },
      { header: "Loại khách", key: "Loại khách", width: 18 },
      { header: "Chi nhánh", key: "Chi nhánh", width: 32 },
      { header: "Nhân viên phụ trách", key: "Nhân viên phụ trách", width: 28 },
      { header: "Ghi chú", key: "Ghi chú", width: 32 },
    ], filteredCustomers.map((customer) => ({
      "Mã KH": customer.customer_code,
      "Tên khách hàng": customer.name,
      "Số điện thoại": customer.phone,
      "Địa chỉ": customer.address ?? "",
      "Loại khách": customer.customer_type,
      "Chi nhánh": customer.branches?.name ?? "",
      "Nhân viên phụ trách": customer.assigned_staff?.full_name ?? "",
      "Ghi chú": customer.note ?? "",
    })));
  }

  function updateForm(name: keyof FormState, value: string) {
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === "branch_id") next.assigned_staff_id = "";
      return next;
    });
  }

  function resetForm() {
    setEditing(null);
    setMessage("");
    setForm({
      ...initialForm,
      branch_id: role === "branch_manager" || role === "field_staff" ? branchId ?? "" : branches[0]?.id ?? "",
      assigned_staff_id: isFieldStaff ? userId : "",
    });
  }

  function startEdit(customer: CustomerRow) {
    setEditing(customer);
    setMessage("");
    setForm({
      name: customer.name,
      phone: customer.phone,
      address: customer.address ?? "",
      customer_type: customer.customer_type,
      branch_id: customer.branch_id ?? "",
      assigned_staff_id: customer.assigned_staff_id ?? "",
      note: customer.note ?? "",
    });
  }

  function validateAssignedStaff(payloadBranchId: string) {
    if (!form.assigned_staff_id) return "";
    const selectedStaff = staff.find((profile) => profile.id === form.assigned_staff_id);
    if (!selectedStaff) return "Vui lòng chọn nhân viên phụ trách hợp lệ";
    if (role !== "admin" && payloadBranchId && selectedStaff.branch_id !== payloadBranchId) {
      return "Nhân viên phụ trách phải thuộc cùng chi nhánh với khách hàng";
    }
    return "";
  }

  async function saveCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    if (isFieldStaff && !branchId) {
      setError("Tài khoản nhân viên chưa được gán chi nhánh.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const payloadBranchId = role === "branch_manager" || role === "field_staff" ? branchId ?? "" : form.branch_id;
    const staffError = validateAssignedStaff(payloadBranchId);
    if (staffError) {
      setSaving(false);
      setError(staffError);
      return;
    }

    const payload = {
      name: form.name,
      phone: form.phone,
      address: form.address || undefined,
      customer_type: form.customer_type,
      branch_id: payloadBranchId,
      assigned_staff_id: isFieldStaff ? userId : form.assigned_staff_id || undefined,
      note: form.note || undefined,
    };

    const validation = customerSchema.safeParse(payload);
    if (!validation.success) {
      setSaving(false);
      setError(validation.error.issues[0]?.message ?? "Dữ liệu khách hàng chưa hợp lệ");
      return;
    }

    const cleanedPayload = {
      ...validation.data,
      address: validation.data.address || null,
      assigned_staff_id: isFieldStaff ? userId : validation.data.assigned_staff_id || null,
      note: validation.data.note || null,
    };

    const result = editing
      ? await supabase.from("customers").update(cleanedPayload).eq("id", editing.id)
      : await supabase.from("customers").insert({ ...cleanedPayload, created_by: userId });

    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setMessage(editing ? "Đã cập nhật khách hàng" : "Đã thêm khách hàng");
    resetForm();
    await loadData();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Khách hàng</h1>
          <p className="text-sm text-muted-foreground">Quản lý thông tin khách hàng, nhân viên phụ trách và lịch sử đơn hàng.</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
          <Button className="w-full bg-slate-900 sm:w-auto" onClick={() => void loadData()}>
            <RefreshCcw className="h-4 w-4" />
            Tải lại
          </Button>
          <Button className="w-full sm:w-auto" disabled={filteredCustomers.length === 0} onClick={() => void exportCustomers()}>
            <Download className="h-4 w-4" />
            <span className="sm:hidden">Excel</span>
            <span className="hidden sm:inline">Xuất Excel</span>
          </Button>
        </div>
      </div>

      {canManage ? (
        <Card>
          <h2 className="mb-4 font-semibold">{editing ? `Sửa khách hàng ${editing.customer_code}` : "Thêm khách hàng"}</h2>
          <form onSubmit={saveCustomer} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-2">
              <span className="text-sm font-medium">Tên khách hàng</span>
              <Input value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="Nhập tên khách hàng" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Số điện thoại</span>
              <Input value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} placeholder="Nhập số điện thoại" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Loại khách hàng</span>
              <Select value={form.customer_type} onChange={(event) => updateForm("customer_type", event.target.value)}>
                {CUSTOMER_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </Select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Chi nhánh</span>
              <Select value={form.branch_id} disabled={role === "branch_manager" || isFieldStaff} onChange={(event) => updateForm("branch_id", event.target.value)}>
                <option value="">Chọn chi nhánh</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </Select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Nhân viên phụ trách</span>
              <Select value={form.assigned_staff_id} disabled={isFieldStaff} onChange={(event) => updateForm("assigned_staff_id", event.target.value)}>
                <option value="">Chưa giao</option>
                {staffOptions.map((profile) => <option key={profile.id} value={profile.id}>{staffLabel(profile)}</option>)}
              </Select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Địa chỉ</span>
              <Input value={form.address} onChange={(event) => updateForm("address", event.target.value)} placeholder="Nhập địa chỉ" />
            </label>
            <label className="space-y-2 md:col-span-2 xl:col-span-3">
              <span className="text-sm font-medium">Ghi chú</span>
              <Textarea value={form.note} onChange={(event) => updateForm("note", event.target.value)} placeholder="Ghi chú thêm" />
            </label>
            <div className="flex items-end gap-2">
              <Button disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "Đang lưu..." : editing ? "Cập nhật" : "Thêm khách hàng"}
              </Button>
              {editing ? <Button type="button" className="bg-slate-700" onClick={resetForm}>Hủy</Button> : null}
            </div>
          </form>
          {message ? <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
        </Card>
      ) : null}

      <Card>
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-[1fr_220px_220px_240px]">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo mã, tên, số điện thoại hoặc nhân viên" />
          </div>
          <Select value={branchFilter} disabled={!canUseBranchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
            <option value="">Tất cả chi nhánh</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </Select>
          <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">Tất cả loại khách</option>
            {CUSTOMER_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </Select>
          <Select value={staffFilter} onChange={(event) => setStaffFilter(event.target.value)}>
            <option value="">Lọc theo nhân viên</option>
            {staffOptions.map((profile) => <option key={profile.id} value={profile.id}>{staffLabel(profile)}</option>)}
          </Select>
        </div>

        {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-3">Mã KH</th>
                <th>Tên khách hàng</th>
                <th>Số điện thoại</th>
                <th>Loại khách</th>
                <th>Chi nhánh</th>
                <th>Nhân viên phụ trách</th>
                <th className="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="py-8 text-center text-muted-foreground" colSpan={7}>Đang tải danh sách khách hàng...</td></tr>
              ) : filteredCustomers.length === 0 ? (
                <tr><td className="py-8 text-center text-muted-foreground" colSpan={7}>Chưa có khách hàng phù hợp</td></tr>
              ) : filteredCustomers.map((customer) => (
                <tr key={customer.id} className="border-b">
                  <td className="py-3 font-medium">{customer.customer_code}</td>
                  <td>{customer.name}</td>
                  <td>{customer.phone}</td>
                  <td><Badge>{customer.customer_type}</Badge></td>
                  <td>{customer.branches?.name ?? "-"}</td>
                  <td>{customer.assigned_staff?.full_name ?? "Chưa giao"}</td>
                  <td className="py-3 text-right">
                    <Link className="mr-2 inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-3 text-xs font-medium text-white" href={`/customers/${customer.id}` as Route}>
                      <Eye className="h-3.5 w-3.5" />
                      Xem
                    </Link>
                    {(role === "admin" || role === "branch_manager" || (isFieldStaff && (customer.assigned_staff_id === userId || customer.created_by === userId))) ? (
                      <Button className="h-8 px-3" onClick={() => startEdit(customer)}>Sửa</Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
