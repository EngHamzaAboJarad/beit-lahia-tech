# بيت لاهيا تك — موقع التسجيل

صفحة هبوط + نموذج تسجيل لكميونتي تقني بيت لاهيا. التسجيلات بتنحفظ في **Cloud Firestore**، والموقع بينرفع على **Firebase Hosting**.

## الملفات

```
public/
  index.html          صفحة الهبوط (/) — الأهداف، الفئات، المجالات، الأسئلة (عربي RTL، الهوية البصرية: ليل/زمرّد/فراولة)
  join.html           صفحة التسجيل (/join) — الفورم
  admin.html          لوحة الإدارة (/admin) — admin.js + admin.css
  styles.css          التصميم المشترك
  site.js             اللاندج بيج: تحميل المحتوى والفعاليات من Firestore + الأنيميشن
  app.js              منطق الفورم: التحقق + الإرسال + احترام إغلاق التسجيل
  firebase-init.js    تهيئة Firebase المشتركة (Firestore / Auth، والمحاكي على localhost)
  content-defaults.js النصوص الافتراضية للاندج بيج والإعدادات
  motivation.js       الـ50 جملة تحفيزية (جملة لكل بكسل بالفراولة) — عدّلها من هون
  firebase-config.js  اتركه null على Firebase Hosting (الإعدادات بتنقرأ تلقائياً)
  favicon.svg, 404.html
firebase.json         إعدادات الاستضافة + headers أمان + الكاش + المحاكيات
firestore.rules       قواعد الحماية: الموقع بيقدر "يضيف" تسجيل صالح بس، ما بيقدر يقرأ أو يعدّل أو يحذف
.firebaserc           اسم المشروع (غيّره لمشروعك)
```

## بيانات التسجيل (collection: `members`)

| الحقل | النوع | ملاحظة |
|---|---|---|
| `name` | string | 2–80 حرف |
| `status` | `tawjihi` \| `student` \| `graduate` | طالب توجيهي / طالب جامعة / خريج |
| `specialty` | string | من القائمة أو "تخصص آخر" مكتوب (للتوجيهي: التخصص اللي حابب يدرسه) |
| `age` | int | 14–70 |
| `experience` | `none` \| `lt1` \| `1-2` \| `3-5` \| `5+` | سنوات الخبرة — مش موجود لطالب التوجيهي |
| `residence` | string | وين مقيم حالياً |
| `university` | string | مش موجود لطالب التوجيهي |
| `portfolio` | string | اختياري: رابط معرض الأعمال (`https://…`، بيتصلّح تلقائياً لو انكتب بدون https) |
| `notes` | string | اختياري، حتى 1000 حرف |
| `source` | `web` | |
| `createdAt` | timestamp | وقت السيرفر |

## النشر الحالي

- الموقع: https://beit-lahia-tech.web.app (التسجيل: `/join`)
- المشروع: `flutter-app-distribution-a4166` — موقع استضافة منفصل `beit-lahia-tech` جوّا المشروع
- قاعدة البيانات: Firestore `(default)` بموقع `nam5`
- التسجيلات: [Firestore › members](https://console.firebase.google.com/project/flutter-app-distribution-a4166/firestore/data/~2Fmembers)

لتحديث الموقع بعد أي تعديل:

```bash
firebase deploy --only firestore:rules,hosting
```

> ملاحظة: القواعد بتقفل أي collection غير `members`. إذا تطبيق الفلاتر بنفس المشروع احتاج Firestore لاحقاً، لازم تضيف قواعده لنفس ملف `firestore.rules`.

## الرفع لأول مرة (لمشروع جديد)

1. اعمل مشروع على [Firebase Console](https://console.firebase.google.com) وفعّل **Firestore Database** (اختار موقع قريب مثل `europe-west`، و Production mode).
2. من الطرفية داخل المجلد:

```bash
firebase login
```

```bash
firebase use --add
```

اختار مشروعك (هاد بيغيّر `.firebaserc`).

3. ارفع القواعد والموقع:

```bash
firebase deploy --only firestore:rules,hosting
```

الموقع بيصير على `https://<project-id>.web.app`. لربط دومين خاص: Hosting › Add custom domain.

## التجربة محلياً

```bash
firebase emulators:start --project demo-bitlahia
```

- الموقع: http://localhost:5000
- لوحة المحاكي (بتشوف التسجيلات فيها): http://localhost:4000/firestore

على localhost الموقع بيتصل تلقائياً بمحاكي Firestore، فما بتتسجل بيانات حقيقية.

## لوحة الإدارة (`/admin`)

أربع تبويبات:
- **التسجيلات:** جدول + إحصائيات + بحث وفلترة + تعليم «تواصلنا» + حذف + تصدير Excel (CSV).
- **محتوى الصفحة:** تعديل كل نصوص اللاندج بيج (الواجهة، الأهداف، رحلة العضو، المجالات، الدعوة، الأسئلة). بيظهر على الموقع فوراً.
- **الفعاليات:** إضافة فعالية/دورة/إعلان، نشر أو إخفاء، تعديل، حذف. سكشن الفعاليات بيظهر على الصفحة بس لما يكون في شي منشور.
- **المعرض:** رفع صور (بتتصغّر تلقائياً بالمتصفح وبتنحفظ بـ Firestore، بدون Cloud Storage أو خطة مدفوعة)، وصف، نشر/إخفاء، ترتيب، حذف. سكشن «معرض الصور» مخفي من الصفحة الرئيسية لحد ما تنشر أول صورة.
- **الإعدادات:** فتح وإغلاق التسجيل + رسالة الإغلاق (القواعد كمان بترفض التسجيل وهو مسكّر).

### إضافة أدمن (مرة وحدة لكل أدمن)

1. Firebase Console › **Authentication** › Get started › Sign-in method › فعّل **Email/Password**.
2. Authentication › Users › **Add user**: إيميل وكلمة سر الأدمن.
3. انسخ **User UID** تبعه.
4. Firestore › Start collection: اسمها `admins`، و Document ID = الـ UID، وضيف حقل مثلاً `role` = `admin`.
5. ادخل على `/admin` بالإيميل وكلمة السر.

لو دخلت بحساب مش مضاف، الصفحة بتعرضلك الـ UID تبعه عشان تنسخه للخطوة 4.

### تجربة اللوحة محلياً

```bash
firebase emulators:start --project demo-bitlahia
```

```bash
powershell -File scripts/seed-emulator.ps1
```

السكربت بيعمل أدمن تجريبي على المحاكي بس (الإيميل وكلمة السر جوّا الملف).

## مشاهدة التسجيلات

Firebase Console › Firestore Database › `members`. للتصدير لملف Excel/CSV بتقدر تستخدم BigQuery export أو سكربت صغير بـ Admin SDK.

## حماية إضافية (مستحسن قبل النشر الواسع)

- فعّل **App Check** مع reCAPTCHA Enterprise عشان تمنع البوتات تضيف تسجيلات من برا الموقع.
- النموذج فيه honeypot مخفي ضد البوتات البسيطة، والقواعد بترفض أي بيانات بشكل غلط.
