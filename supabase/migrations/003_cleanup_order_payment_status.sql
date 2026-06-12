update public.orders
set
  status = 'Hoàn tất',
  payment_status = 'Đã thu đủ'
where status = 'Đã thanh toán';

update public.orders
set
  status = 'Hoàn tất',
  payment_status = 'Còn nợ'
where status = 'Còn nợ';
