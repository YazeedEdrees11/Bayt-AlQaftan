# بيت القفطان

**Bayt Al-Qaftan** — نظام إدارة داخلي لمحل بيت القفطان لإدارة المنتجات والمخزون والمبيعات والموردين والعملاء والمالية.

هذا نظام داخلي للموظفين فقط. **ليس متجراً إلكترونياً**: لا يوجد موقع للعملاء، ولا سلة شراء، ولا دفع إلكتروني، ولا شحن. كل البيانات تُدخل يدوياً من قِبل الموظفين عبر لوحة التحكم.

---

## الحالة

اكتملت المراحل العشر. النظام جاهز للتشغيل بعد خطوات التجهيز في
[دليل المسؤول](ADMIN-GUIDE.md).

| المرحلة | ما تغطيه |
| --- | --- |
| ١ | الحسابات والأدوار والصلاحيات وسجل النشاط |
| ٢ | التصنيفات والمنتجات والموديلات والمخزون |
| ٣ | الموردون والمشتريات وأرصدة الموردين |
| ٤ | المبيعات والعملاء وخصم المخزون تلقائياً |
| ٥ | المرتجعات والاستبدالات والتالف وتعديلات المخزون |
| ٦ | الصندوق والبنك والمصاريف والتحويلات والذمم |
| ٧ | التقارير ولوحة المؤشرات والتصدير |
| ٨ | الإعدادات وقواعد العمل والمستخدمون والتنبيهات |
| ٩ | التقسية للإنتاج: الأمان والنسخ والأداء والموثوقية |
| ١٠ | مراجعة نهائية، تحسين الواجهة، والتجهيز للتشغيل |

### المساهمة في الكود

رسائل الـ commit تحمل اسم صاحب المشروع وحده. **لا تُضاف أي إشارة إلى أدوات
الذكاء الاصطناعي** — ولا سطر `Co-Authored-By: Claude ...` — في أي رسالة commit
في هذا المستودع.

### الأدلة

| الدليل | لمن |
| --- | --- |
| [دليل الموظف](USER-GUIDE.md) | من يبيع ويستقبل المرتجعات على الأرض |
| [دليل المسؤول](ADMIN-GUIDE.md) | مالك المحل أو مديره |
| [DEPLOYMENT.md](DEPLOYMENT.md) | من ينشر النظام |
| [SECURITY.md](SECURITY.md) | نموذج الأمان والقرارات وراءه |
| [BACKUP.md](BACKUP.md) | النسخ الاحتياطي والاستعادة |

### خارج النطاق، عن قصد

مرتجعات المشتريات للموردين، والمحاسبة المزدوجة والقوائم المالية. المحل لا
يحتاجهما اليوم، وإضافة أيٍّ منهما لاحقاً لا تتطلب تغيير ما هو قائم.

---

## نموذج البيانات (المرحلة ٢)

```
categories ──< products ──< product_variants ──< inventory_transactions
                   │               │
                   │               └── suppliers (مورد افتراضي، معلوماتي فقط)
                   └──< product_images
```

- **المنتج** (`products`) نموذج عام مثل «ثوب كلاسيك» — غير قابل للبيع بذاته.
- **الموديل** (`product_variants`) هو القطعة القابلة للبيع بلون ومقاس محددين، وله SKU فريد.
- **المخزون لا يُخزَّن كعمود.** يُحتسب من `inventory_transactions` عبر العرض `variant_stock`.

### قواعد أساسية

| القاعدة | التنفيذ |
| --- | --- |
| كل تغيير في المخزون يمر بحركة مخزون | لا توجد أي واجهة أو دالة تعدّل كمية مباشرة |
| المخزون لا يصبح سالباً | Trigger `enforce_non_negative_stock` مع قفل صف الموديل |
| حركات المخزون غير قابلة للتعديل | Trigger `prevent_inventory_mutation` + لا توجد صلاحيات UPDATE/DELETE |
| المنتج ذو حركة مخزون لا يُحذف | Trigger `prevent_delete_with_history` — يُعطَّل بدلاً من حذفه |
| SKU فريد دائماً، والباركود فريد عند وجوده | فهارس فريدة (الباركود جزئي) |
| قيمة المخزون بسعر الشراء | `search_inventory` و `inventory_summary` |
| اتجاه الحركة من نوعها | عمود محسوب `signed_quantity` — لا يمكن تسجيل خصم كإضافة |

---

## المشتريات وأرصدة الموردين (المرحلة ٣)

```
suppliers ──< purchases ──< purchase_items ──> product_variants
    │             │                                  │
    │             └──< purchase_payments             └──> inventory_transactions
    └──< supplier_balance_transactions                     PURCHASE / PURCHASE_REVERSAL
```

- **رصيد المورد لا يُخزَّن كرقم.** يُحتسب من `supplier_balance_transactions`
  عبر العرض `supplier_balance`. الرصيد الموجب = مبلغ مستحق للمورد.
- **استلام البضاعة يمر بسجل المخزون نفسه**: كل بند يُنشئ حركة `PURCHASE`
  مرجعها الفاتورة، فلا يوجد مسار جانبي لتعديل الكميات.
- **بنود الفاتورة تحتفظ بنسخة تاريخية** من اسم المنتج و SKU واللون والمقاس
  والسعر، فتبقى الفاتورة صحيحة حتى لو تغيّر المنتج لاحقاً.

### قواعد أساسية

| القاعدة | التنفيذ |
| --- | --- |
| رقم الفاتورة فريد ومتسلسل | `purchase_number_seq` — وليس `count(*) + 1` |
| العمليات المركّبة ذرّية | `create_purchase` / `add_purchase_payment` / `cancel_purchase` |
| المجاميع تُحتسب في قاعدة البيانات | الخادم يتجاهل أي مجاميع يرسلها المتصفح |
| المدفوع لا يتجاوز الإجمالي | قيد `CHECK` + تحقق داخل الدالة |
| الدفعة لا تتجاوز المستحق | قفل صف الفاتورة ثم التحقق |
| التحويل البنكي يتطلب بنك ورقم تحويل | Zod + الدالة + قيد `CHECK` |
| الإلغاء لا يحذف شيئاً | حركات `PURCHASE_REVERSAL` + قيد `ADJUSTMENT` معاكس |
| لا يمكن الإلغاء إذا خرجت الكميات | فحص المخزون لكل بند قبل العكس |
| اتجاه الحركة المالية من نوعها | عمود محسوب `signed_amount` |

> **ملاحظة على الإلغاء:** المبالغ المدفوعة فعلياً تبقى في السجل. بعد إلغاء
> فاتورة مدفوعة جزئياً يصبح الرصيد سالباً ويظهر كـ«رصيد دائن لدى المورد»،
> لأن المال خرج بالفعل. تسوية هذا الرصيد أو استرداده عملية مستقبلية.

### صلاحيات الكتابة

جداول المشتريات **لا تملك أي صلاحية كتابة مباشرة** لدور `authenticated` — فقط
`SELECT`. كل الكتابة تمر عبر دوال `SECURITY DEFINER` تتحقق من الصلاحية أولاً،
ولذلك لا يمكن العبث بـ `paid_amount` أو `remaining_amount` أو رصيد المورد عبر
طلب PostgREST مُصاغ يدوياً.

---

## المبيعات والعملاء (المرحلة ٤)

```
customers ──< sales ──< sale_items ──> product_variants
    │           │                            │
    │           └──< sale_payments           └──> inventory_transactions
    └──< customer_balance_transactions             SALE / SALE_REVERSAL
```

- **رصيد العميل لا يُخزَّن كرقم.** يُحتسب من `customer_balance_transactions`
  عبر العرض `customer_balance`. الرصيد الموجب = مبلغ مستحق على العميل،
  والسالب = رصيد دائن له.
- **البيع يخصم المخزون عبر السجل نفسه**: كل بند يُنشئ حركة `SALE` مرجعها
  عملية البيع، فلا يوجد مسار جانبي لتخفيض الكميات.
- **الزبون العابر لا يُنشئ سجل عميل ولا حركة رصيد** — `customer_id` تبقى
  `NULL` وقاعدة العملاء تبقى نظيفة.
- **التكلفة تُجمَّد وقت البيع** في `sales.total_cost` و `sale_items.unit_cost`،
  فشراء لاحق بسعر مختلف لا يُعيد كتابة ربح عملية ماضية.

### قواعد أساسية

| القاعدة | التنفيذ |
| --- | --- |
| رقم البيع فريد ومتسلسل | `sale_number_seq` — وليس `count(*) + 1` |
| رقم العميل فريد ومتسلسل | `customer_number_seq` |
| العمليات المركّبة ذرّية | `create_sale` / `complete_sale` / `add_sale_payment` / `cancel_sale` |
| لا بيع بأكثر من المتوفر | قفل صف الموديل ثم فحص السلة كاملة قبل أي خصم |
| البيع لا يُنفَّذ جزئياً | نقص أي بند يُلغي العملية كلها |
| المدفوع لا يتجاوز الإجمالي | تحقق داخل الدالة + قفل صف العملية |
| التحويل البنكي يتطلب بنك ورقم تحويل | Zod + الدالة + قيد `CHECK` |
| الإلغاء لا يحذف شيئاً | حركات `SALE_REVERSAL` + قيد معاكس على حساب العميل |
| عميل له تاريخ لا يُحذف | مُشغِّل `prevent_customer_delete_with_history` |
| سجل الرصيد غير قابل للتعديل | مُشغِّل يمنع `UPDATE` — تُضاف حركة مصحِّحة بدلاً منه |
| اتجاه حركة المخزون من نوعها | عمود محسوب `signed_quantity` |

> **ملاحظة على الخصم والربح:** الخصم يُطبَّق على الإيراد قبل خصم التكلفة،
> ويُوزَّع على البنود بنسبة قيمة كل بند، فيساوي مجموع أرباح البنود ربح العملية
> بدل تضخيم الإيراد بمقدار الخصم.

> **ملاحظة على الإلغاء:** المبالغ المحصَّلة فعلياً تبقى في السجل. بعد إلغاء بيع
> مدفوع يظهر المبلغ كرصيد دائن للعميل، لأن المال دخل الصندوق بالفعل. تسوية هذا
> الرصيد أو ردّه عملية مستقبلية.

### التزامن

عند بيع القطعة الأخيرة من عدة نقاط بيع في اللحظة نفسها، تُقفل صفوف الموديلات
**قبل** أي كتابة تمسّها وبترتيب ثابت حسب `variant_id`. الترتيب الثابت يمنع
التشابك (deadlock) بين سلّتين تشتركان في أكثر من موديل، والقفل المبكر يمنع
ترقية القفل من مشترك إلى حصري. النتيجة: المحاولات تُنفَّذ بالتتابع، ومن يخسر
السباق يحصل على رسالة «الكمية المطلوبة لم تعد متوفرة» بدل خطأ قاعدة بيانات.

### صلاحيات الكتابة

جداول المبيعات **لا تملك أي صلاحية كتابة مباشرة** لدور `authenticated` — فقط
`SELECT` (وجدول `customers` يقبل `UPDATE` للمدير و `DELETE` للمسؤول فقط). كذلك
`customer_balance_transactions` **لا يقرأه** موظف المبيعات إطلاقاً: الأرصدة
بيانات مالية مقصورة على المدير فأعلى.

---

## المرتجعات والاستبدالات وتعديلات المخزون (المرحلة ٥)

```
sales ──< sales_returns ──< sales_return_items ──> product_variants
   │           │                                        │
   │           └──< return_refunds                       └──> inventory_transactions
   │                                                          SALE_RETURN / RETURN_REVERSAL
   └──< exchanges ──< exchange_items ──> product_variants
                                              EXCHANGE_IN / EXCHANGE_OUT

inventory_adjustments ──< inventory_adjustment_items ──> ADJUSTMENT_IN / ADJUSTMENT_OUT
```

### حالتا المخزون

سجل المخزون صار يعرف **أين** تقع الحركة: `AVAILABLE` أو `DAMAGED`.

- `variant_stock.current_stock` بقي كما هو: **المخزون القابل للبيع**، ويقابله
  `available_quantity`. القطع التالفة تُعرض في `damaged_quantity` ولا تدخله أبداً.
- مرتجع تالف يُسجَّل كحركة `SALE_RETURN` عادية لكن في حالة `DAMAGED` — فالقطعة
  محسوبة وموجودة، ولا يمكن بيعها.
- منع الرصيد السالب يعمل **لكل حالة على حدة**، فلا يُسحب التالف من المتاح ولا العكس.

### مصدر واحد لاتجاه الحركة

كان اتجاه كل نوع حركة مكتوباً مرتين: في العمود المحسوب `signed_quantity` وداخل
مُشغِّل `enforce_non_negative_stock`. المرحلة ٥ أضافت خمسة أنواع جديدة، فاستُبدلت
هذه الازدواجية بدالة واحدة `inventory_direction()` يستعملها الاثنان — فلا يمكن
لنوع جديد أن يحصل على اتجاهين مختلفين.

### قواعد أساسية

| القاعدة | التنفيذ |
| --- | --- |
| رقم المرتجع/الاستبدال/التعديل فريد ومتسلسل | `return_number_seq` / `exchange_number_seq` / `adjustment_number_seq` |
| لا إرجاع بأكثر من المُباع | العرض `sale_item_returns` يحتسب المرتجعات **والاستبدالات** معاً |
| قيمة المرتجع بسعر ما دفعه العميل فعلاً | خصم الفاتورة يُوزَّع على البنود قبل حساب قيمة الإرجاع |
| التالف لا يُخلط بالقابل للبيع | عمود `stock_state` + منع السالب لكل حالة |
| لا إرجاع من فاتورة ملغاة | فحص حالة الفاتورة داخل الدالة |
| لا إلغاء فاتورة لها مرتجعات | فحص في `cancel_sale` — تُلغى المرتجعات أولاً |
| المبلغ المسترد لا يتجاوز قيمة المرتجع | قفل صف المرتجع ثم التحقق |
| رصيد للعميل يتطلب عميلاً مسجلاً | فحص في الدالة + في الواجهة |
| كمية النظام تُقرأ داخل المعاملة | لا تُرسل من المتصفح إطلاقاً (§56) |
| سجل الاسترداد غير قابل للتعديل أو الحذف | مُشغِّل `prevent_refund_mutation` |
| الإلغاء لا يحذف شيئاً | `RETURN_REVERSAL` وحركات استبدال معاكسة |

> **ملاحظة على الاسترداد الجزئي:** المرتجع يُنقص ما على العميل بكامل قيمته، ثم
> يُسجَّل ما خرج من الصندوق كحركة معاكسة. الفرق يبقى رصيداً دائناً للعميل — لا
> يضيع المبلغ ولا يحتاج قيداً يدوياً.

> **ملاحظة على الاستبدال:** لا يُسجَّل كبيع + مرتجع، لأن ذلك يضخّم مبيعات اليوم
> بقيمة القطعة البديلة كاملة. هو عملية واحدة يتغيّر فيها الفرق فقط.

### التزامن

كل الدوال تقفل صفوف الموديلات **قبل** أي كتابة تمسّها وبترتيب ثابت حسب
`variant_id` — نفس الانضباط الذي أصلح تشابك المرحلة ٤. المحاكاة تحت الضغط: ١٥
محاولة إرجاع لبند مباع ٥ قطع تقبل ٥ بالضبط؛ ١٢ استبدالاً على ٣ قطع متاحة تقبل ٣؛
و١٠ عمليات جرد متزامنة تُدخل جميعها ٣٠ فينتهي المخزون على ٣٠ — لا ٢٠ + ١٠×١٠ —
لأن كل عملية تقرأ كمية النظام داخل معاملتها وتحت قفل الصف.

### صلاحيات الكتابة

جداول المرتجعات والاستبدالات والتعديلات **لا تملك أي صلاحية كتابة مباشرة** لدور
`authenticated` — فقط `SELECT`. كذلك `return_refunds` **لا يقرأه** موظف المبيعات:
ما خرج من الصندوق بيانات مالية مقصورة على المدير فأعلى.

موظف المبيعات يستطيع تسجيل مرتجع (استلام البضاعة عمل يومي)، لكن **دفع المبلغ**
يحتاج صلاحية `CREATE_REFUNDS` — فيصل المرتجع بحالة «بدون استرداد» ليسوّيه المدير.

---

## المالية (المرحلة ٦)

```
financial_accounts ──< financial_transactions
                              ▲   ▲   ▲   ▲
        sale_payments ────────┘   │   │   └──── expenses
        purchase_payments ────────┘   └──────── financial_transfers
        return_refunds ───────────────────────  financial_adjustments
```

### المبدأ: الإيراد ليس النقد

بيع بمئة دينار حُصِّل منه ستون هو **مئة إيراد**، و**ستون نقداً**، و**أربعون ذمة
على العميل**. سجل `financial_transactions` يسجّل الستين فقط — حركة المال
الحقيقية — ويشير دائماً إلى السجل الذي سبّبها. المبيعات والمشتريات والمرتجعات
والمصاريف تبقى في جداولها، ولا يُنسخ أي رقم مرتين.

كذلك: **المشتريات ليست المدفوعات.** فاتورة بخمسمئة دُفع منها ثلاثمئة تُسجَّل
كخمسمئة مشتريات، وثلاثمئة نقداً خارجاً، ومئتين ذمة للمورد.

### الربط بالمراحل السابقة

جداول الدفع القائمة (`sale_payments` و`purchase_payments` و`return_refunds`)
تعرف **كيف** دُفع المبلغ لا **من أي حساب**. لذلك أُضيف لها عمود اختياري
`financial_account_id`، ورُبطت بالسجل المالي عبر **مُشغِّلات** لا بتعديل دوال
المراحل ٣–٥:

- المُشغِّل يعمل داخل نفس المعاملة التي كتبت الدفعة، فلا توجد دفعة بلا حركة
  مالية ولا العكس — دون أن تتذكّر ثماني دوال ذلك كل مرة.
- كل مسارات الكتابة تُغطّى دفعة واحدة، ولم تُمَس أي دالة موثّقة من المراحل
  السابقة.

### قواعد أساسية

| القاعدة | التنفيذ |
| --- | --- |
| الرصيد يُحتسب من السجل لا من عمود | العرض `account_balances` — و`current_balance` نسخة مخبَّأة فقط |
| الرصيد الافتتاحي نفسه حركة مسجّلة | `OPENING_BALANCE` — فلا يمكن للرصيد أن يخالف تاريخه |
| دفعة واحدة = حركة مالية واحدة | فهرس فريد على (المرجع، النوع) — يحمي المُشغِّل والترحيل معاً |
| لا رصيد سالب | مُشغِّل يفحص كل حركة صادرة قبل تنفيذها |
| رصيد للعميل لا يحرّك نقداً | `CUSTOMER_CREDIT` لا يُنشئ أي حركة مالية |
| التحويل ليس دخلاً ولا مصروفاً | نوعا `TRANSFER_IN/OUT` مستثنيان من التدفق والربح |
| المصروف نقداً من الصندوق لا من البنك | فحص تطابق الحساب مع طريقة الدفع |
| السجل المالي غير قابل للتعديل أو الحذف | مُشغِّل — التصحيح بحركة عكسية |
| إلغاء المصروف يعيد المبلغ ولا يحذفه | حركة `EXPENSE_REVERSAL` واردة |
| تعديل الرصيد يدوياً يتطلب سبباً ومسؤولاً | `financial_adjustments` — للمسؤول فقط |
| كشف الصندوق يقفل دائماً | بندا «وارد آخر» و«صادر آخر» يستوعبان أي نوع حركة |

> **ملاحظة على الربح والنقد:** الربح التشغيلي والرصيد النقدي رقمان مختلفان ولا
> يساوي أحدهما الآخر. الشاشة تفصل بينهما صراحةً: أرقام الفترة تتبع الفترة
> المختارة، والأرصدة لحظية لا تتأثر بها.

> **ملاحظة محاسبية:** هذا ليس نظام محاسبة مزدوجة القيد. لا توجد قيود يومية ولا
> دليل حسابات ولا ميزانية عمومية. هو نظام إدارة نقد وبنك ومصاريف تشغيلية،
> مبنيّ بحيث يقبل التوسّع لاحقاً.

### الصلاحيات

المدير يدير مال المحل يومياً: يرى الوضع المالي، ويسجّل المصاريف، ويحوّل بين
الحسابات. ما يبقى للمسؤول وحده هو ما **يعيد تعريف الدفاتر نفسها**: إنشاء
الحسابات أو تعديلها، وتصحيح الرصيد يدوياً. موظف المبيعات **لا يرى المالية
إطلاقاً** — لا أرصدة ولا حركات ولا مصاريف.

---

## التقارير والتحليلات (المرحلة ٧)

تقرأ التقارير السجلات نفسها التي تعمل عليها الشاشات اليومية. لا يوجد جدول ثانٍ
للأرقام ولا نسخة محفوظة منها، فلا يمكن لشاشتين أن تختلفا على ما ربحه المحل.

| التقرير | المسار |
| --- | --- |
| مركز التقارير | `/reports` |
| المبيعات · أكثر المنتجات مبيعاً · أفضل العملاء | `/reports/sales` · `/reports/products/top` · `/reports/customers/top` |
| الأرباح · الأرباح حسب المنتج | `/reports/profit` · `/reports/products/profit` |
| قيمة المخزون · المنخفض · النافد · الراكد · الحركة | `/reports/inventory/*` |
| المشتريات · الموردون · ذممهم | `/reports/purchases` · `/reports/suppliers` · `/reports/suppliers/debt` |
| العملاء · ذممهم | `/reports/customers` · `/reports/customers/debt` |
| طرق الدفع · الإغلاق اليومي | `/reports/payments` · `/reports/daily-closing` |
| الأداء الشهري · السنوي | `/reports/monthly` · `/reports/yearly` |

تقرير المصاريف والتدفق النقدي يفتحان شاشتي المرحلة السادسة (`/finance/…`)، لأن
بناء شاشة ثانية فوق نفس الأرقام هو الطريق إلى إجابتين مختلفتين.

### تعريف واحد لكل رقم

`get_profit_report` يستدعي `finance_summary` بدل أن يعيد الحساب، و
`get_management_kpis` و`get_daily_closing_summary` والأداء الشهري والسنوي كلها
تمر عليه. هذا مثبت باختبار: أي فرق بين شاشة الأرباح وشاشة المالية يسقط الاختبار.

### الفلاتر والتصدير

الفلاتر تعيش في الرابط، فالتقرير يُحفظ ويُرسل ويعود كما هو. التصدير (CSV و
Excel) **لا يقبل صفوفاً من المتصفح إطلاقاً**: يستقبل اسم التقرير والفلاتر،
ويعيد تنفيذ الاستعلام على الخادم بجلسة صاحب الطلب. لذلك لا يمكن أن يحتوي ملف
مصدَّر على ما لا يستطيع صاحبه رؤيته على الشاشة.

### PDF

لا يوجد مولّد PDF على الخادم — مكتبات Node لا تصل الحروف العربية، فتخرج
«ا ل م ب ي ع ا ت» بدل «المبيعات». التقارير تحمل ورقة طباعة (A4، رأس جدول
مكرر، إخفاء أدوات التحكم)، و«حفظ كـ PDF» من المتصفح ينتج الملف الصحيح لأن
المتصفح يشكّل العربية كما يجب.

### لوحة الإدارة

مؤشرات الفترة، ومقارنة بالفترة السابقة لها بنفس الطول، وتنبيهات مبنية على حدود
مخزّنة في `report_settings` لا على أرقام مكتوبة في الكود. لون المقارنة يتبع ما
إذا كانت الحركة **في صالح المحل**، لا اتجاه السهم: ارتفاع المصاريف والمرتجعات
أحمر وإن كان صعوداً. حين تكون الفترة السابقة صفراً تُحذف النسبة بدل أن تُعرض
قفزة لا نهائية.

---

## الإعدادات وإدارة النظام (المرحلة ٨)

قواعد العمل خرجت من الشيفرة إلى قاعدة البيانات. المالك يغيّر سلوك النظام من
شاشة الإعدادات، وكل إعداد يؤثر على قاعدة عمل **مفروض على الخادم** — لا على
الواجهة وحدها.

| القسم | المسار |
| --- | --- |
| بيانات المحل · الإيصالات · الترقيم | `/settings/store` · `/settings/receipts` · `/settings/numbering` |
| المستخدمون · الأدوار والصلاحيات | `/settings/users` · `/settings/roles` |
| قواعد العمل | `/settings/{business,inventory,sales,purchases,returns,exchanges,finance,reports}` |
| التنبيهات · سجل النشاط | `/settings/notifications` · `/settings/audit-log` |
| البيانات · النظام | `/settings/data` · `/settings/system` |
| مركز التنبيهات | `/notifications` |

### مصفوفة الصلاحيات

كانت خريطة «الدور ← الصلاحيات» ثابتاً في TypeScript، ما يعني أنها لا تُفرض إلا
في التطبيق. صارت الآن في جدول `role_permissions`، وحرّاس قاعدة البيانات الاثنا
عشر (`can_sell()` وأخواتها) يقرأون منه. إيقاف «إنشاء بيع» عن موظف المبيعات لا
يخفي زراً — بل يجعل `create_sale` يرفضه.

البذرة **مولّدة من `lib/permissions/permissions.ts`** لا مكتوبة يدوياً، فترحيل
النظام لم يغيّر صلاحيات أحد. ودور المسؤول غير قابل للتعديل إطلاقاً: النظام يجب
أن يبقى فيه من يديره، ورفض الكتابة أضمن من فحص نتائجها بعد وقوعها.

### الإعدادات تحمل قواعد التحقق معها

كل صف في `system_settings` يحمل نوعه وحدوده وقيمه المسموحة، فـ `update_setting`
يتحقق من أي قيمة دون شرط ضخم، والواجهة تبني عنصر التحكم من البيانات نفسها. لا
يمكن لشاشة أن تعرض خياراً سترفضه قاعدة البيانات.

### أين تُفرض القواعد فعلاً

| القاعدة | مكان الفرض |
| --- | --- |
| بادئات الترقيم | دوال `next_*_number()` الاثنتا عشرة |
| المخزون السالب | المُشغِّل + الدوال الثلاث التي تتحقق من السلة مسبقاً |
| حد الخصم · العميل الآجل · العميل العابر | `create_sale` |
| سبب الإلغاء | `cancel_sale` |
| مدة الاسترجاع · طرق الاسترداد | `create_sales_return` |
| إيصال المصروف | `create_expense` |
| التسويات اليدوية | `create_financial_adjustment` |
| إلزام المورد | `create_purchase` |

### التنبيهات وسجل النشاط

التنبيهات تُولَّد على الخادم من `compute_management_alerts()` — نفس القواعد التي
تقرأها التقارير، بتعريف واحد. تنبيه واحد لكل حالة في اليوم: تجاهله الآن، ويعود
غداً إن بقيت المشكلة.

سجل النشاط يُقرأ ولا يُكتب فيه من الواجهة ولا يُحذف منه: لا توجد سياسة تعديل أو
حذف على `audit_logs`، ولا ينبغي أن تُضاف. سجل يمكن تعديله ليس دليلاً على شيء.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix) |
| Icons | Lucide React |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Auth / DB / Storage | Supabase (`@supabase/supabase-js`, `@supabase/ssr`) |
| Toasts | Sonner |

Architecture: a clean **modular monolith** inside Next.js. No separate API server, no ORM, no custom JWT handling, no custom password hashing — Supabase Auth owns identity, Postgres RLS owns data access.

---

## Installation

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

The app runs at <http://localhost:3000>. Any unauthenticated visit redirects to `/login`.

### Requirements

- Node.js 20 or newer
- A Supabase project

---

## Environment variables

Create `.env.local` from `.env.example`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Find these in **Supabase Dashboard → Project Settings → API**.

| Variable | Exposure | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser | Safe to expose. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser | Safe to expose — RLS is what protects the data. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Bypasses RLS completely. |

> **Never** rename the service-role key to `NEXT_PUBLIC_*`, and never import
> `createAdminClient()` from a Client Component. It is used only inside
> `"use server"` actions, and `lib/supabase/server.ts` carries `import "server-only"`
> so a stray client import fails the build rather than leaking at runtime.

---

## Supabase setup

1. Create a project at <https://supabase.com>.
2. **Authentication → Providers**: keep **Email** enabled, and disable every
   social/OTP provider — the app only uses email + password.
3. **Authentication → Providers → Email**: turn **"Confirm email"** off, or make
   sure users created by an administrator are confirmed (the app already passes
   `email_confirm: true` when creating them).
4. Disable public sign-ups (**Authentication → Sign In / Providers → "Allow new
   users to sign up"** off). There is no registration page: only an ADMIN
   creates accounts.
5. Run the database migration below.

### Database migration

Open **Supabase Dashboard → SQL Editor**, paste the whole contents of:

```
supabase/migrations/0001_auth_foundation.sql
supabase/migrations/0002_catalog_inventory.sql
supabase/migrations/0003_purchases.sql
supabase/migrations/0004_purchase_drafts.sql
supabase/migrations/0005_sales.sql
supabase/migrations/0006_sale_lock_order.sql
supabase/migrations/0007_returns_exchanges_adjustments.sql
supabase/migrations/0008_customer_ledger_refund_fix.sql
supabase/migrations/0009_finance.sql
supabase/migrations/0010_daily_cash_residuals.sql
supabase/migrations/0011_reporting.sql
supabase/migrations/0012_report_authorization.sql
supabase/migrations/0013_report_variable_conflict.sql
supabase/migrations/0014_profit_dimension_performance.sql
supabase/migrations/0015_settings_foundation.sql
supabase/migrations/0016_business_rules.sql
supabase/migrations/0017_negative_stock_everywhere.sql
supabase/migrations/0018_sales_series_window.sql
supabase/migrations/0019_settings_that_did_nothing.sql
supabase/migrations/0020_return_condition_scope.sql
supabase/migrations/0021_adjustment_reason_scope.sql
supabase/migrations/0022_draft_discount_recheck.sql
```

and run them **in order**. All twenty-two are idempotent — re-running is safe.

`0001` creates:

- `public.profiles` — one row per auth user (name, email, role, activation)
- `public.audit_logs` — append-only trail shared by every module
- Role constraint (`ADMIN` / `MANAGER` / `STAFF`), foreign keys, indexes
- `updated_at` trigger
- `on_auth_user_created` trigger → auto-creates a profile for every new auth user
- Privilege-escalation guard trigger on `profiles`
- Row Level Security + policies on `profiles` and `audit_logs`
- Storage buckets: `product-images`, `payment-receipts`, `avatars`

`0002` creates:

- `categories`, `suppliers`, `products`, `product_variants`, `product_images`
- `inventory_transactions` — the append-only stock ledger
- Views `variant_stock` and `product_overview` (both `security_invoker`)
- Functions `search_products`, `search_inventory`, `inventory_summary`
- Transactional writers `create_product_with_variants`, `create_variant_with_stock`
- Triggers: `updated_at`, non-negative stock, append-only ledger, delete guard,
  primary-image coherence
- RLS + policies on all six tables
- Switches `product-images` to a **private** bucket with signed-URL access
- Seeds six starter categories (fully editable afterwards)

`0003` creates:

- `purchases`, `purchase_items`, `purchase_payments`, `supplier_balance_transactions`
- `purchase_number_seq` + `next_purchase_number()` → `PUR-000001`
- Views `supplier_balance` and `purchase_overview`
- Functions `search_purchases`, `supplier_ledger`
- Atomic writers `create_purchase`, `add_purchase_payment`, `cancel_purchase`
- Adds `PURCHASE_REVERSAL` and `PURCHASE_RETURN` to the inventory ledger types
- RLS: read for ADMIN + MANAGER, **no direct write grants at all**
- Locks `payment-receipts` down to ADMIN + MANAGER with signed-URL access

`0004` adds:

- `DRAFT` purchases — saved without touching stock or the supplier balance
- `complete_purchase` and `delete_draft_purchase`

`0005` creates:

- `customers`, `sales`, `sale_items`, `sale_payments`, `customer_balance_transactions`
- `customer_number_seq` → `CUS-000001`, `sale_number_seq` → `SAL-000001`
- Views `customer_balance`, `sale_overview`, `customer_overview`
- Functions `search_customers`, `search_sales`, `sales_summary`,
  `top_selling_products`, `top_customers`, `customer_ledger`
- Atomic writers `create_sale`, `complete_sale`, `add_sale_payment`,
  `cancel_sale`, `delete_draft_sale`, `create_customer`
- **Rebuilds the `signed_quantity` generated column** so `SALE_REVERSAL` and
  `SALE_RETURN` count as incoming stock. The expression of a generated column
  cannot be altered in place, so the column is dropped and re-added with
  `variant_stock` and `product_overview` dropped and recreated around it
- RLS: sales and customers readable by any active user; **balances readable by
  ADMIN + MANAGER only**; no direct write grants on the money tables
- Adds the private `sale-payment-receipts` bucket

`0006` fixes concurrency in `create_sale` / `cancel_sale`:

- Locks product variants **before** the `sale_items` insert, so a session never
  waits for an exclusive lock while holding the shared lock its foreign key took
- Locks variants in ascending `variant_id` order, so two baskets sharing
  products cannot each hold what the other waits for

Without `0006`, four simultaneous sales of the same product already produced
deadlock aborts and sixteen left only one survivor. Nothing was ever corrupted —
the failing transactions rolled back cleanly — but sales failed under load.

`0007` creates:

- `sales_returns`, `sales_return_items`, `return_refunds`, `exchanges`,
  `exchange_items`, `inventory_adjustments`, `inventory_adjustment_items`
- `return_number_seq` → `RET-000001`, `exchange_number_seq` → `EXC-000001`,
  `adjustment_number_seq` → `ADJ-000001`
- Views `sale_item_returns`, `return_overview`, `exchange_overview`,
  `adjustment_overview`, `sale_net_overview`
- Functions `sale_returnable_items`, `search_returns`, `search_exchanges`,
  `search_adjustments`, `returns_summary`, `damaged_stock`
- Atomic writers `create_sales_return`, `add_return_refund`,
  `cancel_sales_return`, `create_exchange`, `cancel_exchange`,
  `create_inventory_adjustment`, `cancel_inventory_adjustment`,
  `record_stock_damage`
- **Adds `stock_state` to the inventory ledger** (`AVAILABLE` / `DAMAGED`) and
  **rebuilds `signed_quantity`** as `inventory_direction(type) * quantity`, so
  the sign of a movement is defined in exactly one place instead of two
- Extends `cancel_sale` to refuse a sale that has returns or exchanges
- Extends `sales_summary` with the period's returns
- RLS: readable by any active user; **`return_refunds` by ADMIN + MANAGER only**;
  no direct write grants on any of the seven tables
- Adds the private `return-refund-receipts` bucket

`0008` fixes two defects `0007` introduced, both found by the verification run:

- Phase 4 named its ledger constraint `customer_balance_type_check`, but `0007`
  tried to drop `customer_balance_transactions_type_check`. The `DROP` matched
  nothing, so the old constraint stayed in force and **every cash or bank refund
  was rejected** and rolled its return back
- Cancelling an `EVEN` exchange posted a zero-value ledger adjustment, which
  `customer_balance_amount_check` rejects — so it could never be cancelled

`0009` creates:

- `financial_accounts`, `financial_transactions`, `expense_categories`,
  `expenses`, `financial_transfers`, `financial_adjustments`
- `ACC-` / `EXP-` / `FIN-` / `TRF-` / `FAD-` sequences
- Views `account_balances`, `customer_receivables`, `supplier_payables`
- Reporting: `finance_summary`, `search_expenses`,
  `search_financial_transactions`, `account_ledger`, `expense_report`,
  `payment_method_breakdown`, `finance_series`, `daily_cash_summary`
- Atomic writers `create_financial_account`, `update_financial_account`,
  `create_expense`, `cancel_expense`, `create_financial_transfer`,
  `create_financial_adjustment`
- `backfill_financial_transactions` — idempotent by the same unique index the
  live triggers rely on
- **Adds a nullable `financial_account_id`** to `sale_payments`,
  `purchase_payments`, `return_refunds` and `exchanges`, plus triggers that
  write the ledger row inside the same transaction. No Phase 3–5 function is
  touched
- Non-negative balance enforcement on every outgoing movement
- RLS: ADMIN and MANAGER only; adjustments ADMIN-only; **STAFF sees no finance**
- Adds the private `expense-receipts` bucket
- **Seeds الصندوق and البنك as defaults.** This is not decoration: every payment
  resolves an account through `resolve_financial_account()`, and with no default
  for a method that lookup raises and the sale fails

`0010` fixes the daily cash statement, which did not add up. It itemised the
movement kinds it knew about but derived the closing balance from all of them,
so a manual adjustment changed the closing figure while appearing on no line.
`other_in` and `other_out` are residuals, so the statement balances by
construction whatever movement kinds exist later.

`0011` adds reporting: `minimum_stock`, `report_settings`, `cash_closings`, four
reporting views and nineteen functions. No new source of truth — every figure is
derived from records that already existed.

`0012` closes a hole `0011` left open. Its report functions were `language sql`
with no permission check, granted to `authenticated`, so a STAFF user with
nothing but their own session could call the RPC directly and read the whole
profit report — gross sales, COGS, margin. Verified by doing it. The four
reporting views had the same problem: `security_invoker` makes them exactly as
permissive as the RLS a salesperson needs to do their job. Every function now
refuses without `can_view_reports()`, and every view filters on it; RLS still
applies underneath. `0012` also fixes per-product revenue, which summed line
totals **before** the invoice discount while valuing returns **after** it, so
the profit breakdown added up to more than its own headline. The discount is now
spread across the lines that earned it.

`0013` follows from `0012`. Converting those functions to plpgsql made the
`returns table (...)` columns into variables, so a body selecting a column of the
same name stopped resolving — `column reference "stock_cost" is ambiguous`. It
broke the two management queries. `#variable_conflict use_column` settles it.

`0014` is performance. Measured against 10,000 sales carrying 100,000 lines,
every report answered inside a second except `get_profit_by_dimension` at
2.2 seconds: it ran two correlated sub-selects over the whole sale-line set once
per variant in the catalogue. Aggregating by variant first does the same
arithmetic once.

`0015` moves configuration into the database: the store profile, 81 settings
across 12 categories, and the role → permission matrix. The matrix seed is
generated from the application's own constants and the twelve permission guards
are rewritten to read it, so migrating changes nobody's access while making the
permission screen real. Two guards (`can_manage_catalog`, `can_manage_purchases`)
gain an `is_active_user()` check they did not have — a deactivated manager could
previously still write through the API.

`0016` makes those settings bite. Each affected function keeps the body its phase
verified, with the settings check inserted: the discount ceiling inside
`create_sale`, the return window inside `create_sales_return`, the numbering
prefix inside `next_*_number()`. It also adds notifications, generated from the
same `compute_management_alerts()` the reports read.

`0017` fixes what `0016` missed. The negative-stock setting was placed in
`enforce_non_negative_stock` — the trigger every movement passes through — and
that was not enough: `apply_sale_completion`, `create_exchange` and
`record_stock_damage` all validate the whole basket *before* writing, so they
refused first and the trigger never ran. With the setting on, a sale still
failed. A rule enforced in one of the four places that decide the same question
is not enforced at all.

`0019` is what 0017 prompted. If one rule was enforced in one of the four
places that decide it, how many others were? Cross-referencing all thirty
business-rule settings against every `setting_*()` call in the schema answered
it: **fourteen were read by no code path at all.** The screens existed, the
switches moved, the audit trail recorded the change, and nothing happened — the
whole exchanges category among them. It also closes a second instance of 0017's
exact shape: `create_sale` checked `require_customer_for_credit` and
`complete_sale`, the other path to a completed sale, did not.

`0020` and `0021` correct two mistakes in `0019`, both found by testing each
setting **both ways** — on must refuse, off must permit. The first was serious:
the `require_return_condition` check sat inside a loop over a rebuilt object
carrying only `sale_item_id` and `quantity`, so it could never see a condition
and would have refused *every* return in the shop, the setting being true by
default. The second was the same shape: `require_adjustment_reason` compared a
variable that had already defaulted a missing reason to `'STOCK_COUNT'`.

Both are one pattern worth remembering: **a value nobody supplied is quietly
replaced by a plausible default, and the check downstream sees the default
rather than the absence.** "We did not look" gets recorded as a specific claim
about what was found. Validate the payload, not the variable derived from it.

`0022` re-reads the discount ceiling when a draft becomes a sale. `create_sale`
checked it and `complete_sale` did not, on the reasoning that the draft had
already been validated — but a draft is not a sale, drafts can be written in
advance, and lowering the limit would otherwise leave every one of them still
completable at the old ceiling.

`0018` clamps `get_sales_series` to the range it was asked for. Buckets are built
with `date_trunc`, so a range starting mid-period began at the period boundary
and counted sales from outside the window — the chart on `/reports/sales`
disagreeing with the headline above it by 600. Invisible until Phase 8's tests
left a sale dated forty days back.

---

## First admin setup

There is deliberately no public registration page, so the very first
administrator is created by hand:

1. **Supabase Dashboard → Authentication → Users → Add user**
   - enter an email and password
   - tick **Auto Confirm User**
2. The `on_auth_user_created` trigger creates the matching profile with the
   default `STAFF` role.
3. Promote it in the **SQL Editor**:

   ```sql
   update public.profiles
      set role = 'ADMIN', is_active = true
    where lower(email) = lower('you@example.com');
   ```

4. Sign in at `/login`. From then on, every other account is created from
   **المستخدمين** (`/users`) inside the app.

---

## Authentication

- Method: **email + password only**. No Google / Apple / Facebook / OTP / magic links.
- Sign-in runs in a Server Action (`app/actions/auth.ts`), so session cookies are
  written server-side, the `is_active` check cannot be bypassed by the client,
  and every login is recorded in `audit_logs`.
- Sessions are refreshed on every request by `middleware.ts` →
  `lib/supabase/middleware.ts`, using the official `@supabase/ssr` pattern.
  Tokens are never stored in `localStorage`.
- Sign-out calls `supabase.auth.signOut()`, which revokes the refresh token —
  the session is genuinely invalidated, not merely forgotten by the UI.
- Deactivated accounts are signed out at the door: the dashboard guard sends
  them through `/auth/signout?reason=inactive`, and they land back on `/login`
  with «حسابك غير مفعل. يرجى التواصل مع مدير النظام.»

### Route protection

| Route | Access |
| --- | --- |
| `/login` | Signed-out only (signed-in users bounce to `/dashboard`) |
| `/dashboard`, `/settings/*` | Any active, signed-in user |
| `/products`, `/products/[id]` | `VIEW_PRODUCTS` (all roles) |
| `/products/new`, `/products/[id]/edit` | `CREATE_PRODUCTS` / `UPDATE_PRODUCTS` (ADMIN + MANAGER) |
| `/products/[id]/variants/[variantId]` | `VIEW_INVENTORY` (all roles) |
| `/inventory` | `VIEW_INVENTORY` (all roles) |
| `/suppliers`, `/suppliers/[id]` | `VIEW_SUPPLIERS` (ADMIN + MANAGER) |
| `/purchases`, `/purchases/[id]` | `VIEW_PURCHASES` (ADMIN + MANAGER) |
| `/purchases/new` | `CREATE_PURCHASES` (ADMIN + MANAGER) |
| `/sales`, `/customers` | All roles |
| `/finance` | ADMIN |
| `/reports` | ADMIN + MANAGER |
| `/users` | ADMIN |

Two layers enforce this, plus a third in the database:

1. `middleware.ts` — signed-in vs. signed-out, on every request.
2. `lib/auth/require-auth.ts` — `requireAuth()`, `requirePermission()`,
   `requireAdmin()` run inside each Server Component before anything renders.
   An unauthorised user is redirected to `/access-denied`.
3. **RLS** — even a forged request cannot read or write rows it does not own.

The sidebar hides items the user cannot reach, but that is cosmetic only;
removing the client-side check changes nothing about what the server allows.

---

## Roles

| Role | Arabic | Summary |
| --- | --- | --- |
| `ADMIN` | مدير النظام | Full access, including user management and finance |
| `MANAGER` | مدير | Day-to-day operations and reports; no users, no finance, no system settings |
| `STAFF` | موظف | Sells, registers customers, views products and stock |

Detailed matrix:

| | ADMIN | MANAGER | STAFF |
| --- | :---: | :---: | :---: |
| الرئيسية | ✅ | ✅ | ✅ |
| المنتجات (عرض / تعديل) | ✅ / ✅ | ✅ / ✅ | ✅ / — |
| المخزون (عرض / إدارة) | ✅ / ✅ | ✅ / ✅ | ✅ / — |
| الموردين | ✅ | ✅ | — |
| المشتريات | ✅ | ✅ | — |
| المبيعات (عرض / تسجيل / إلغاء) | ✅ / ✅ / ✅ | ✅ / ✅ / ✅ | ✅ / ✅ / — |
| العملاء | ✅ | ✅ | ✅ |
| المالية | ✅ | — | — |
| التقارير | ✅ | ✅ | — |
| تقارير الأرباح | ✅ | ✅ | — |
| المستخدمين | ✅ | — | — |
| إعدادات النظام | ✅ | — | — |
| إضافة/تعديل الموردين | ✅ | ✅ | — |
| حذف الموردين نهائياً | ✅ | — | — |
| تعديل المخزون | ✅ | ✅ | — |
| تسجيل المشتريات | ✅ | ✅ | — |
| إلغاء المشتريات | ✅ | ✅ | — |
| عرض أرصدة الموردين | ✅ | ✅ | — |
| تسجيل دفعات الموردين | ✅ | ✅ | — |

> ملاحظة: كل مستخدم نشط يستطيع **قراءة** أسماء الموردين، لأن جدول المخزون يعرض
> مورد كل موديل والموظف يطّلع على المخزون. أما **إدارة** الموردين وصفحة
> `/suppliers` فتبقى لـ `ADMIN` و`MANAGER` فقط.

---

## Permissions

Defined once in `lib/permissions/` and reused by every module:

- `permissions.ts` — the permission identifiers and the role → permission matrix
- `roles.ts` — role labels, descriptions and hierarchy (`canManageRole`)
- `check-permission.ts` — `hasPermission`, `hasAnyPermission`, `isAdmin`, …

```ts
import { hasPermission } from "@/lib/permissions/check-permission";

if (hasPermission(profile, "VIEW_FINANCE")) {
  // render the finance widget
}
```

Adding a module later means: add the permission to the `Permission` union in
`types/auth.ts`, list it in `PERMISSIONS`, grant it to the right roles in
`ROLE_PERMISSIONS`, and add one entry to `NAV_SECTIONS` in `lib/navigation.ts`.
Navigation, guards and the UI all follow automatically.

### Audit log

```ts
import { logAction } from "@/lib/audit/log-action";

await logAction({
  userId: user.id,
  action: "CREATE_SALE",
  entityType: "sale",
  entityId: sale.id,
  metadata: { total, paymentMethod: "CASH" },
});
```

Already recorded: `LOGIN`, `LOGOUT`, `CREATE_USER`, `UPDATE_USER`,
`CHANGE_ROLE`, `ACTIVATE_USER`, `DEACTIVATE_USER`, `UPDATE_PROFILE`.
The table is append-only: no UPDATE or DELETE grant, no policy for either.

---

## Storage

Three buckets are provisioned by the migration, ready for later phases:

| Bucket | Public | Purpose |
| --- | --- | --- |
| `product-images` | **no** | Product photography — live since Phase 2 |
| `payment-receipts` | no | Supplier bank-transfer receipts — live since Phase 3 |
| `sale-payment-receipts` | no | Customer bank-transfer receipts — live since Phase 4 |
| `return-refund-receipts` | no | Refund transfer receipts — live since Phase 5 |
| `expense-receipts` | no | Expense receipts — live since Phase 6 |
| `avatars` | yes | Profile pictures |

`product-images` is private. Images are stored at
`products/{product_id}/{uuid}.{ext}` and served through **signed URLs** minted
per request (1-hour TTL) for users who pass the storage policy, so nothing is
readable from a guessed URL. Only the storage path is kept in Postgres —
never the bytes.

Uploads are validated three times: in the browser, again in the Server Action,
and by the bucket's own MIME/size limits (JPG/PNG/WEBP, 5 MB). If the metadata
row fails to insert after a successful upload, the orphaned object is deleted
so storage and the database cannot drift apart.

> Because signed URLs expire, product images use a plain `<img>` rather than
> `next/image` — the optimizer would cache a URL that stops working.

---

## Payment methods

**Cash** and **bank transfer** only. There is no Stripe, PayPal, or any online
payment gateway.

Supplier payments are live (`purchase_payments`): a bank transfer stores
`bank_name`, `transfer_reference`, `payment_date` and an optional
`receipt_image_path` pointing into the private `payment-receipts` bucket. The
same two methods will serve the sales module in a later phase.

Supplier payments are kept entirely separate from future customer payments —
they live on the supplier account, not on a sales record.

---

## Development

```bash
npm run dev        # dev server (Turbopack)
npm run build      # production build
npm run start      # serve the production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

### Project structure

```
app/
  (auth)/login/            login page (public)
  (dashboard)/             every protected route; layout runs requireAuth()
    dashboard/  products/  inventory/  suppliers/  purchases/
    sales/      customers/ finance/    reports/    users/
    settings/   settings/profile/      access-denied/
  actions/                 "use server" actions (auth, users, profile)
  auth/signout/            route handler used by the deactivation guard
components/
  ui/                      shadcn/ui primitives
  auth/  layout/  users/  settings/  dashboard/  shared/  brand/
lib/
  supabase/                client.ts, server.ts, middleware.ts
  auth/                    get-current-user, get-current-profile, require-auth
  permissions/             roles, permissions, check-permission
  audit/                   log-action
  users/  utils/  validation/  navigation.ts  routes.ts  constants.ts
types/                     auth.ts, database.ts
supabase/migrations/       0001 … 0018 (auth, catalog, purchases, sales,
                           returns, finance, reporting, settings)
middleware.ts              session refresh + auth boundary
```

### Language & RTL

The whole UI is Arabic, `lang="ar"` / `dir="rtl"`, set on `<html>` in
`app/layout.tsx`. Radix primitives receive the direction through
`Direction.Provider` in `components/providers.tsx`, so menus, sheets and
tooltips open on the correct side. The typeface is **IBM Plex Sans Arabic**,
loaded with `next/font`.

Source code stays English: variables, functions, types, table and column names.

> Note on `middleware.ts`: Next.js 16 prints a deprecation notice suggesting
> `proxy.ts`. The file works as-is; rename it and its exported function if you
> would rather silence the warning.

---

## Production build

```bash
npm run build
npm run start
```

Every authenticated route is rendered per request (`export const dynamic =
"force-dynamic"` on the dashboard layout), because the session, the profile and
the permission checks all depend on the incoming cookies.

Set the three environment variables in your hosting provider before deploying.

---

## Security notes

- **Supabase Auth owns passwords.** They are never hashed, stored or handled by
  this application.
- **The service-role key never reaches the browser.** It is read only inside
  `"use server"` code, in a module marked `import "server-only"`.
- **Front-end role checks are cosmetic.** Every action re-authorizes on the
  server (`authorizeAction`), and RLS re-checks again in Postgres.
- **Users cannot change their own role or activation state.** A database trigger
  forces `role`, `is_active`, `email` and `id` back to their previous values for
  any ordinary signed-in user, so tampering with the request body achieves
  nothing.
- **Administrators cannot lock themselves out.** The server actions refuse to
  let an admin change their own role or deactivate their own account; another
  administrator has to do it.
- **A MANAGER cannot create or edit an ADMIN.** `canManageRole()` blocks it in
  the action, and `MANAGE_USERS` is not in the MANAGER permission set at all.
- **Accounts are deactivated, never deleted.** History that future sales and
  purchases will reference stays intact.
- **All input is validated with Zod** — in the browser for feedback, and again
  on the server, where it actually counts.
- **Raw Supabase errors are never shown.** The login form always answers with
  «البريد الإلكتروني أو كلمة المرور غير صحيحة», so it cannot be used to probe
  which addresses are registered.
