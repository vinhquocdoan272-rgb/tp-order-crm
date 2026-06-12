import { DataModule } from "@/components/tables/data-module";

export default function BranchesPage() {
  return (
    <DataModule
      config={{
        title: "Chi nhánh",
        description: "Quản lý danh sách chi nhánh của Tin Học Tấn Phát.",
        table: "branches",
        select: "*",
        searchFields: ["name", "phone", "address", "manager_name"],
        exportName: "chi-nhanh",
        canDelete: true,
        columns: [
          { key: "name", label: "Tên chi nhánh" },
          { key: "address", label: "Địa chỉ" },
          { key: "phone", label: "Điện thoại" },
          { key: "manager_name", label: "Quản lý" },
        ],
        fields: [
          { name: "name", label: "Tên chi nhánh", required: true },
          { name: "address", label: "Địa chỉ" },
          { name: "phone", label: "Điện thoại" },
          { name: "manager_name", label: "Quản lý" },
          { name: "note", label: "Ghi chú", type: "textarea" },
        ],
      }}
    />
  );
}
