"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Plus, RefreshCcw, Save, Search } from "lucide-react";
import { ROLE_LABELS, USER_ROLES } from "@/lib/constants/app";
import { createClient } from "@/lib/supabase/browser";
import { exportToExcel } from "@/lib/export/excel";
import type { Branch, Profile, UserRole } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type ProfileRow = Pick<Profile, "id" | "full_name" | "phone" | "role" | "branch_id" | "is_active" | "created_at"> & {
  branches?: Pick<Branch, "name"> | null;
};

type FormState = {
  id: string;
  full_name: string;
  phone: string;
  role: "" | UserRole;
  branch_id: string;
  is_active: "true" | "false";
};

const initialForm: FormState = {
  id: "",
  full_name: "",
  phone: "",
  role: "",
  branch_id: "",
  is_active: "true",
};

const activeLabels: Record<"true" | "false", string> = {
  true: "Đang hoạt động",
  false: "Tạm khóa",
};

function isBranchRequired(role: FormState["role"]) {
  return role === "branch_manager" || role === "field_staff";
}

function matchesSearch(profile: ProfileRow, keyword: string) {
  const value = keyword.trim().toLowerCase();
  if (!value) return true;

  return [
    profile.full_name,
    profile.phone,
    profile.role ? ROLE_LABELS[profile.role] : "",
    profile.branches?.name,
    profile.is_active ? activeLabels.true : activeLabels.false,
  ]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(value));
}

export function UsersModule({
  currentRole,
  currentBranchId,
}: {
  currentRole: UserRole;
  currentBranchId: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [branches, setBranches] = useState<Pick<Branch, "id" | "name">[]>([]);
  const [form, setForm] = useState<FormState>({ ...initialForm, branch_id: currentRole === "branch_manager" ? currentBranchId ?? "" : "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const roleOptions = currentRole === "admin"
    ? USER_ROLES
    : USER_ROLES.filter((role) => role.value === "field_staff");

  async function loadData() {
    setLoading(true);
    setMessage("");

    let profilesQuery = supabase
      .from("profiles")
      .select("id, full_name, phone, role, branch_id, is_active, created_at, branches(name)")
      .order("created_at", { ascending: false });

    if (currentRole === "branch_manager" && currentBranchId) {
      profilesQuery = profilesQuery.eq("branch_id", currentBranchId).eq("role", "field_staff");
    }

    const [profilesResult, branchesResult] = await Promise.all([
      profilesQuery,
      supabase.from("branches").select("id, name").order("name"),
    ]);

    setLoading(false);

    if (profilesResult.error) {
      setMessage(profilesResult.error.message);
      return;
    }
    if (branchesResult.error) {
      setMessage(branchesResult.error.message);
      return;
    }

    setProfiles((profilesResult.data ?? []) as unknown as ProfileRow[]);
    setBranches((branchesResult.data ?? []).filter((branch) => currentRole === "admin" || branch.id === currentBranchId));
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredProfiles = useMemo(() => profiles.filter((profile) => matchesSearch(profile, query)), [profiles, query]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "role" && !isBranchRequired(value as FormState["role"])) next.branch_id = "";
      if (currentRole === "branch_manager") {
        next.role = "field_staff";
        next.branch_id = currentBranchId ?? "";
      }
      return next;
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm({ ...initialForm, branch_id: currentRole === "branch_manager" ? currentBranchId ?? "" : "" });
  }

  function editProfile(profile: ProfileRow) {
    if (currentRole === "branch_manager" && (profile.role !== "field_staff" || profile.branch_id !== currentBranchId)) {
      setMessage("Bạn không có quyền truy cập chức năng này.");
      return;
    }
    setEditingId(profile.id);
    setForm({
      id: profile.id,
      full_name: profile.full_name ?? "",
      phone: profile.phone ?? "",
      role: currentRole === "branch_manager" ? "field_staff" : profile.role,
      branch_id: currentRole === "branch_manager" ? currentBranchId ?? "" : profile.branch_id ?? "",
      is_active: profile.is_active ? "true" : "false",
    });
  }

  function validateForm() {
    if (!form.full_name.trim()) return "Vui lòng nhập họ tên";
    if (!form.role) return "Vui lòng chọn vai trò";
    if (currentRole === "branch_manager" && form.role !== "field_staff") return "Quản lý chi nhánh chỉ được tạo nhân viên kỹ thuật.";
    if (isBranchRequired(form.role) && !form.branch_id) return "Vui lòng chọn chi nhánh cho quản lý chi nhánh hoặc nhân viên kỹ thuật";
    if (!editingId && !form.id.trim()) return "Vui lòng nhập ID tài khoản Supabase / User UID";
    return "";
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const validationMessage = validateForm();
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    const payload = {
      id: form.id.trim(),
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      role: currentRole === "branch_manager" ? "field_staff" : form.role,
      branch_id: currentRole === "branch_manager" ? currentBranchId : form.branch_id || null,
      is_active: form.is_active === "true",
    };

    const result = editingId
      ? await supabase.from("profiles").update(payload).eq("id", editingId)
      : await supabase.from("profiles").insert(payload);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    resetForm();
    setMessage(editingId ? "Đã cập nhật người dùng" : "Đã thêm người dùng");
    await loadData();
  }

  async function exportUsers() {
    await exportToExcel(
      "nguoi-dung",
      "Người dùng",
      [
        { header: "Họ tên", key: "full_name" },
        { header: "Số điện thoại", key: "phone" },
        { header: "Vai trò", key: "role_label" },
        { header: "Chi nhánh", key: "branch_name" },
        { header: "Trạng thái", key: "active_label" },
      ],
      filteredProfiles.map((profile) => ({
        ...profile,
        role_label: ROLE_LABELS[profile.role],
        branch_name: profile.branches?.name ?? "",
        active_label: profile.is_active ? activeLabels.true : activeLabels.false,
      })),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Người dùng</h1>
          <p className="text-sm text-muted-foreground">Phân quyền, gán chi nhánh và bật/tắt tài khoản nhân sự.</p>
        </div>
        <div className="flex gap-2">
          <Button className="bg-slate-900" onClick={() => void loadData()}>
            <RefreshCcw className="h-4 w-4" />
            Tải lại
          </Button>
          <Button onClick={() => void exportUsers()}>
            <Download className="h-4 w-4" />
            Xuất Excel
          </Button>
        </div>
      </div>

      <Card>
        <form onSubmit={(event) => void saveProfile(event)} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-medium">ID tài khoản Supabase / User UID</span>
            <Input value={form.id} disabled={Boolean(editingId)} required={!editingId} onChange={(event) => updateForm("id", event.target.value)} />
            <span className="block text-xs text-muted-foreground">Lấy trong Supabase Authentication → Users</span>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Họ tên</span>
            <Input value={form.full_name} onChange={(event) => updateForm("full_name", event.target.value)} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Số điện thoại</span>
            <Input value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Vai trò</span>
            <Select value={form.role} disabled={currentRole === "branch_manager"} onChange={(event) => updateForm("role", event.target.value as FormState["role"])}>
              <option value="">Chọn vai trò</option>
              {roleOptions.map((role) => <option key={role.value} value={role.value}>{ROLE_LABELS[role.value]}</option>)}
            </Select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Chi nhánh</span>
            <Select value={form.branch_id} disabled={currentRole === "branch_manager"} required={isBranchRequired(form.role)} onChange={(event) => updateForm("branch_id", event.target.value)}>
              <option value="">{isBranchRequired(form.role) ? "Chọn chi nhánh" : "Không bắt buộc"}</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </Select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Trạng thái tài khoản</span>
            <Select value={form.is_active} onChange={(event) => updateForm("is_active", event.target.value as FormState["is_active"])}>
              <option value="true">Đang hoạt động</option>
              <option value="false">Tạm khóa</option>
            </Select>
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit"><Save className="h-4 w-4" />{editingId ? "Cập nhật" : "Thêm mới"}</Button>
            <Button type="button" className="bg-slate-700" onClick={resetForm}>
              {editingId ? "Hủy" : <><Plus className="h-4 w-4" />Làm mới</>}
            </Button>
          </div>
        </form>
        {message ? <p className="mt-4 rounded-md bg-muted p-3 text-sm">{message}</p> : null}
      </Card>

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm kiếm người dùng..." />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-3">Họ tên</th>
                <th>Số điện thoại</th>
                <th>Vai trò</th>
                <th>Chi nhánh</th>
                <th>Trạng thái</th>
                <th className="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="py-6 text-center" colSpan={6}>Đang tải dữ liệu...</td></tr>
              ) : filteredProfiles.length === 0 ? (
                <tr><td className="py-6 text-center" colSpan={6}>Chưa có người dùng</td></tr>
              ) : filteredProfiles.map((profile) => (
                <tr key={profile.id} className="border-b">
                  <td className="py-3">{profile.full_name}</td>
                  <td>{profile.phone ?? "-"}</td>
                  <td><Badge>{ROLE_LABELS[profile.role]}</Badge></td>
                  <td>{profile.branches?.name ?? "-"}</td>
                  <td><Badge className={profile.is_active ? "bg-emerald-100 text-emerald-700" : "bg-zinc-200 text-zinc-700"}>{profile.is_active ? activeLabels.true : activeLabels.false}</Badge></td>
                  <td className="text-right"><Button className="h-8 bg-slate-900 px-3" onClick={() => editProfile(profile)}>Sửa</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
