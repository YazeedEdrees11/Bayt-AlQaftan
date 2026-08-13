import type { FieldCopy } from "@/components/settings/settings-form";

/**
 * Field labels and the consequences worth spelling out.
 *
 * The database already carries an Arabic description of every setting; what it
 * cannot carry is what happens when you change one. A shopkeeper turning off
 * «إلزام تحديد عميل للبيع الآجل» deserves to be told, in the same breath, that
 * they are agreeing to debts nobody owes.
 */
export const SETTINGS_COPY: Record<string, FieldCopy> = {
  /* --------------------------------- business ------------------------------ */
  default_payment_method: {
    label: "طريقة الدفع الافتراضية",
    hint: "تُقترح في شاشات البيع والشراء والمصاريف، ويمكن تغييرها قبل الحفظ.",
  },
  default_cash_account_id: {
    label: "حساب النقد الافتراضي",
    hint: "الحساب الذي تُسجَّل فيه المقبوضات النقدية ما لم يُحدَّد غيره.",
  },
  default_bank_account_id: {
    label: "الحساب البنكي الافتراضي",
    hint: "الحساب الذي تُسجَّل فيه التحويلات البنكية ما لم يُحدَّد غيره.",
  },
  default_expense_category_id: {
    label: "تصنيف المصاريف الافتراضي",
    hint: "يُقترح عند تسجيل مصروف جديد.",
  },

  /* -------------------------------- inventory ------------------------------ */
  default_minimum_stock: {
    label: "الحد الأدنى الافتراضي",
    hint: "يُقترح عند إنشاء موديل جديد. الموديلات الحالية لا تتأثر.",
  },
  allow_negative_stock: {
    label: "السماح بالمخزون السالب",
    hint: "عند التعطيل، بيع كمية غير متوفرة يُرفض. عند التفعيل، يُسمح به ويصبح الرصيد سالباً.",
    confirm:
      "تفعيل المخزون السالب يعني أن النظام سيقبل بيع بضاعة غير موجودة في الجرد، وستصبح أرصدة المخزون سالبة. لا تفعّله إلا إذا كان الجرد لديك يتأخر عن البيع فعلاً.",
  },
  track_damaged_stock: {
    label: "تتبع المخزون التالف",
    hint: "عند التعطيل تختفي شاشة التالف من الواجهة. السجلات المكتوبة سابقاً تبقى كما هي، ولا تزال تُحتسب في تقارير المخزون.",
  },
  require_adjustment_reason: { label: "إلزام سبب تعديل المخزون" },
  require_adjustment_notes: { label: "إلزام ملاحظات تعديل المخزون" },
  require_adjustment_approval: {
    label: "إلزام موافقة مدير",
    hint: "غير مفعّل في هذه المرحلة؛ البنية جاهزة لتفعيله لاحقاً.",
    readOnly: true,
  },

  /* ---------------------------------- sales -------------------------------- */
  default_discount_percent: {
    label: "نسبة الخصم المقترحة",
    hint: "تظهر مقترحة في فاتورة جديدة. اتركها صفراً إن لم يكن لديك خصم دائم.",
  },
  allow_manual_discount: {
    label: "السماح بالخصم اليدوي",
    hint: "عند التعطيل، لا يمكن إدخال أي خصم على الفاتورة.",
  },
  maximum_discount_percent: {
    label: "الحد الأقصى للخصم",
    hint: "نسبة من قيمة الفاتورة. يُرفض أي خصم يتجاوزها على مستوى قاعدة البيانات، لا الواجهة فقط.",
  },
  require_customer_for_credit: {
    label: "إلزام تحديد عميل للبيع الآجل",
    hint: "الفاتورة غير المسددة بالكامل دَين، والدَين يحتاج من يتحمّله.",
  },
  allow_walk_in_sales: {
    label: "السماح بالبيع لعميل عابر",
    hint: "عند التعطيل، كل فاتورة يجب أن ترتبط بعميل مسجّل.",
  },
  allow_editing_completed_sale: {
    label: "السماح بتعديل فاتورة مكتملة",
    hint: "تعديل فاتورة مكتملة غير مطبّق؛ المعالجة تتم بمرتجع أو إلغاء، لا بالكتابة فوق مستند صدر للعميل.",
    readOnly: true,
  },
  allow_sale_cancellation: { label: "السماح بإلغاء الفواتير" },
  require_cancellation_reason: {
    label: "إلزام سبب الإلغاء",
    hint: "فاتورة ملغاة بلا سبب هي فجوة في السجل لا يستطيع أحد تفسيرها لاحقاً.",
  },

  /* -------------------------------- purchases ------------------------------ */
  allow_purchase_editing: {
    label: "السماح بتعديل فاتورة شراء",
    hint: "تعديل فاتورة شراء مكتملة غير مطبّق؛ التصحيح يتم بالإلغاء وإعادة الإدخال.",
    readOnly: true,
  },
  require_supplier: {
    label: "إلزام تحديد مورد",
    hint: "شراء بلا مورد تكلفة لا يمكن مطالبة أحد بها.",
  },
  allow_partial_receiving: {
    label: "السماح بالاستلام الجزئي",
    hint: "الاستلام الجزئي غير مطبّق بعد؛ فاتورة الشراء تُستلم كاملة عند إتمامها.",
    readOnly: true,
  },
  require_purchase_cancellation_reason: { label: "إلزام سبب إلغاء الشراء" },
  default_purchase_payment_method: { label: "طريقة الدفع الافتراضية للمشتريات" },

  /* --------------------------------- returns ------------------------------- */
  allow_returns: {
    label: "السماح بالمرتجعات",
    hint: "عند التعطيل، لا يمكن إنشاء مرتجع جديد. المرتجعات السابقة تبقى كما هي.",
  },
  require_return_reason: { label: "إلزام سبب المرتجع" },
  require_return_condition: { label: "إلزام تحديد حالة القطعة" },
  maximum_return_days: {
    label: "أقصى مدة للاسترجاع",
    hint: "بالأيام، محسوبة من تاريخ البيع. لا تُطبَّق على مرتجعات سُجِّلت سابقاً.",
  },
  allow_damaged_returns: { label: "قبول المرتجعات التالفة" },
  allow_cash_refund: { label: "السماح بالاسترداد النقدي" },
  allow_bank_refund: { label: "السماح بالاسترداد البنكي" },
  allow_customer_credit_refund: { label: "السماح بقيد رصيد للعميل" },

  /* -------------------------------- exchanges ------------------------------ */
  allow_exchanges: { label: "السماح بالاستبدال" },
  require_exchange_reason: { label: "إلزام سبب الاستبدال" },
  allow_customer_pays_difference: { label: "السماح بتحصيل فرق من العميل" },
  allow_customer_receives_difference: { label: "السماح بإعادة فرق للعميل" },
  maximum_exchange_days: {
    label: "أقصى مدة للاستبدال",
    hint: "بالأيام، محسوبة من تاريخ البيع.",
  },

  /* --------------------------------- finance ------------------------------- */
  allow_negative_account_balance: {
    label: "السماح برصيد سالب في الحسابات",
    confirm:
      "الرصيد السالب يعني أن النظام سيقبل صرف مبلغ أكبر مما في الحساب. هذا يخفي أخطاء الصندوق بدل أن يظهرها.",
  },
  require_expense_category: {
    label: "إلزام تصنيف المصروف",
    hint: "التصنيف إلزامي في بنية قاعدة البيانات نفسها.",
    readOnly: true,
  },
  require_expense_receipt: {
    label: "إلزام إرفاق إيصال",
    hint: "عند التفعيل، لا يُقبل المصروف دون صورة الإيصال.",
  },
  require_transfer_notes: { label: "إلزام ملاحظات التحويل" },
  require_financial_adjustment_reason: {
    label: "إلزام سبب التسوية المالية",
    hint: "السبب إلزامي في بنية قاعدة البيانات نفسها ولا يمكن تعطيله.",
    readOnly: true,
  },
  allow_financial_adjustments: {
    label: "السماح بالتسويات المالية اليدوية",
    hint: "للمسؤول وحده حتى عند التفعيل.",
    confirm:
      "التسوية اليدوية تكتب في دفتر المال مباشرة دون بيع أو شراء أو مصروف يقابلها. هي أداة تصحيح، وإساءة استخدامها تجعل الدفاتر تقول أي شيء.",
  },

  /* --------------------------------- reports ------------------------------- */
  default_report_range: {
    label: "الفترة الافتراضية",
    options: [
      { value: "today", label: "اليوم" },
      { value: "week", label: "هذا الأسبوع" },
      { value: "month", label: "هذا الشهر" },
      { value: "lastMonth", label: "الشهر الماضي" },
      { value: "year", label: "هذه السنة" },
    ],
  },
  default_rows_per_page: { label: "عدد الصفوف في الصفحة" },
  default_export_format: {
    label: "صيغة التصدير الافتراضية",
    options: [
      { value: "csv", label: "CSV" },
      { value: "xlsx", label: "Excel" },
    ],
  },
  show_profit_on_dashboard: {
    label: "عرض الأرباح في لوحة الإدارة",
    hint: "الصلاحيات تبقى هي الفاصل: إخفاء رقم هنا لا يمنح أحداً حق رؤيته.",
  },
  show_customer_debt: { label: "عرض ذمم العملاء في لوحة الإدارة" },
  show_supplier_debt: { label: "عرض ذمم الموردين في لوحة الإدارة" },

  /* ------------------------------ notifications ---------------------------- */
  notify_low_stock: { label: "تنبيه المخزون المنخفض" },
  notify_out_of_stock: { label: "تنبيه نفاد المخزون" },
  notify_customer_debt: { label: "تنبيه ذمم العملاء المرتفعة" },
  notify_supplier_debt: { label: "تنبيه ذمم الموردين المرتفعة" },
  notify_high_expenses: { label: "تنبيه ارتفاع المصاريف" },
  notify_high_return_rate: { label: "تنبيه ارتفاع معدل المرتجعات" },
  notify_cash_difference: { label: "تنبيه فروقات جرد الصندوق" },
  cash_difference_threshold: {
    label: "الفرق المقبول في الجرد",
    hint: "أي فرق أكبر من هذا المبلغ يرفع تنبيهاً.",
  },

  /* --------------------------------- receipts ------------------------------ */
  receipt_show_logo: { label: "إظهار شعار المحل" },
  receipt_show_phone: { label: "إظهار هاتف المحل" },
  receipt_show_address: { label: "إظهار عنوان المحل" },
  receipt_show_customer_name: { label: "إظهار اسم العميل" },
  receipt_show_customer_phone: { label: "إظهار هاتف العميل" },
  receipt_show_payment_method: { label: "إظهار طريقة الدفع" },
  receipt_show_salesperson: { label: "إظهار اسم البائع" },
  receipt_show_return_policy: { label: "إظهار سياسة الاسترجاع" },
  receipt_footer_ar: { label: "نص التذييل" },
  return_policy_ar: { label: "سياسة الاسترجاع بالعربية" },
  return_policy_en: { label: "سياسة الاسترجاع بالإنجليزية" },

  /* ---------------------------------- system ------------------------------- */
  maintenance_mode: {
    label: "وضع الصيانة",
    hint: "عند التفعيل، لا يستطيع غير المسؤولين استخدام النظام.",
    confirm:
      "تفعيل وضع الصيانة يوقف كل المستخدمين عدا المسؤولين عن العمل فوراً. لا تفعّله أثناء ساعات البيع.",
  },
  locale: { label: "لغة الواجهة" },
};
