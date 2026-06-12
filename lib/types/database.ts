export type UserRole = "admin" | "branch_manager" | "field_staff";

export type Branch = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  manager_name: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  branch_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  branches?: Pick<Branch, "name"> | null;
};

export type Customer = {
  id: string;
  customer_code: string;
  name: string;
  phone: string;
  address: string | null;
  customer_type: string;
  branch_id: string | null;
  assigned_staff_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  branches?: Pick<Branch, "name"> | null;
  assigned_staff?: Pick<Profile, "full_name" | "role"> | null;
};

export type Order = {
  id: string;
  order_code: string;
  customer_id: string | null;
  branch_id: string | null;
  assigned_staff_id: string | null;
  service_type: string;
  status: string;
  payment_status: string;
  request_description: string | null;
  technical_note: string | null;
  total_amount: number;
  paid_amount: number;
  debt_amount: number;
  collected_by_type: "staff" | "store" | "owner" | "company_bank";
  collected_by_staff_id: string | null;
  collection_method: string;
  handover_status: string;
  handover_required_amount: number;
  handover_paid_amount: number;
  handover_remaining_amount: number;
  order_date: string;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customers?: Pick<Customer, "name" | "phone" | "customer_code"> | null;
  branches?: Pick<Branch, "name"> | null;
  profiles?: Pick<Profile, "full_name"> | null;
};

export type Invoice = {
  id: string;
  invoice_code: string;
  invoice_type: string;
  order_id: string | null;
  customer_id: string | null;
  branch_id: string | null;
  supplier_name: string | null;
  amount: number;
  invoice_date: string;
  content: string | null;
  file_url: string | null;
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  linked_order_file_id: string | null;
  uploaded_by: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customers?: Pick<Customer, "name" | "phone"> | null;
  branches?: Pick<Branch, "name"> | null;
};

export type OrderExpense = {
  id: string;
  order_id: string;
  branch_id: string | null;
  expense_type: string;
  description: string | null;
  amount: number;
  paid_by: "staff" | "store" | "owner";
  paid_by_staff_id: string | null;
  expense_date: string;
  proof_file_url: string | null;
  proof_file_path: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  branches?: Pick<Branch, "name"> | null;
  paid_by_staff?: Pick<Profile, "full_name"> | null;
};

export type OrderFinancialSummary = {
  order_id: string;
  branch_id: string | null;
  assigned_staff_id: string | null;
  total_amount: number;
  paid_amount: number;
  debt_amount: number;
  total_expenses: number;
  staff_paid_expenses: number;
  store_paid_expenses: number;
  owner_paid_expenses: number;
  net_profit: number;
  staff_profit_share: number;
  owner_profit_share: number;
  staff_total_receivable: number;
  owner_total_receivable: number;
  collected_by_type: "staff" | "store" | "owner" | "company_bank";
  collected_by_staff_id: string | null;
  collection_method: string;
  handover_required_amount: number;
  handover_paid_amount: number;
  handover_remaining_amount: number;
  handover_status: string;
};

export type OrderHandoverPayment = {
  id: string;
  order_id: string;
  branch_id: string | null;
  staff_id: string | null;
  amount: number;
  payment_date: string;
  collection_method: string | null;
  proof_file_url: string | null;
  proof_file_path: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  staff?: Pick<Profile, "full_name"> | null;
};

export type OrderFile = {
  id: string;
  order_id: string;
  file_type: string;
  file_name: string | null;
  file_url: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
  profiles?: Pick<Profile, "full_name"> | null;
};
