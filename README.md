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
| `residence` | string | وين مقيم حالياً: من القائمة، أو مكتوب إذا اختار «غير ذلك» |
| `whatsapp` / `email` | string | واتساب إجباري (بيتخزّن `+970…`)، إيميل اختياري |
| `deletedAt` | timestamp | موجود بس لما يكون التسجيل بسلة المحذوفات |
| `university` | string | مش موجود لطالب التوجيهي |
| `portfolio` | string | اختياري: رابط معرض الأعمال (`https://…`، بيتصلّح تلقائياً لو انكتب بدون https) |
| `notes` | string | اختياري، حتى 1000 حرف |
| `source` | `web` | |
| `createdAt` | timestamp | وقت السيرفر |

## النشر الحالي

- الموقع: https://beitlahia.tech (التسجيل: `/join`). الدومين من Cloudflare، وسجلاته على **DNS only** (الغيمة الرمادية)، والعنوان القديم `beit-lahia-tech.web.app` لسا شغال
- `www.beitlahia.tech` بيحوّل على `beitlahia.tech` (من إعدادات الدومين بـ Firebase Hosting)
- المشروع: `flutter-app-distribution-a4166` — موقع استضافة منفصل `beit-lahia-tech` جوّا المشروع
- قاعدة البيانات: Firestore `(default)` بموقع `nam5`
- التسجيلات: [Firestore › members](https://console.firebase.google.com/project/flutter-app-distribution-a4166/firestore/data/~2Fmembers)

لتحديث الموقع بعد أي تعديل:

```bash
firebase deploy --only firestore:rules,hosting
```

> ملاحظة: القواعد بتقفل أي collection مش مذكورة فيها (`members`، `site`، `events`، `gallery`، `galleryFull`، `stats`، `admins`). إذا تطبيق الفلاتر بنفس المشروع احتاج Firestore لاحقاً، لازم تضيف قواعده لنفس ملف `firestore.rules`.

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

التبويبات:
- **التسجيلات:** جدول + إحصائيات + بحث وفلترة (منها حسب المنطقة) + تعليم «تواصلنا» + تصدير Excel (CSV). الحذف بيودّي التسجيل لـ **سلة المحذوفات**، ومنها بتقدر ترجّعه، وبينحذف نهائياً لحاله بعد 30 يوم.
- **الزيارات:** كم واحد فتح الصفحة الرئيسية، وصفحة التسجيل، وبلّش يعبّي الفورم، وسجّل (آخر 7 أو 30 يوم)، ورسم للزيارات باليوم. العدّاد (`track.js` → `stats/{YYYY-MM-DD}`) بيعدّ كل متصفح مرة باليوم لكل صفحة، بدون بيانات شخصية وبدون كوكيز، وما بيعدّ متصفح الأدمن.
- **محتوى الصفحة:** تعديل كل نصوص اللاندج بيج (الواجهة، الأهداف، رحلة العضو، المجالات، الدعوة، الأسئلة). بيظهر على الموقع فوراً.
- **الفعاليات:** إضافة فعالية/دورة/إعلان، نشر أو إخفاء، تعديل، حذف. سكشن الفعاليات بيظهر على الصفحة بس لما يكون في شي منشور.
- **المعرض:** رفع صور (بتتصغّر تلقائياً بالمتصفح وبتنحفظ بـ Firestore، بدون Cloud Storage أو خطة مدفوعة)، وصف، نشر/إخفاء، ترتيب، حذف. سكشن «معرض الصور» مخفي من الصفحة الرئيسية لحد ما تنشر أول صورة.
- **التواصل:** رقم واتساب الإدارة، وإيميل التواصل، وخانة لكل منصة سوشيال (فيسبوك، إنستغرام، لينكدإن، X، تيليغرام، يوتيوب، تيك توك، GitHub، قناة واتساب) وخانتين «رابط آخر». كل خانة بتتأكد إنه الرابط من منصتها، وفي معاينة حيّة لشكل الأيقونات بالفوتر. الخانة الفاضية ما بتطلع. إذا ما انحفظ ولا مرة، بيطلع الرقم وصفحة الفيسبوك الافتراضيين من `content-defaults.js`.
- **الإعدادات:** رابط قروب الواتساب (بيطلع بعد التسجيل)، وزر **نسخة احتياطية** بينزّل كل البيانات بملف JSON. السطر فوق العنوان بالصفحة الرئيسية بيتحول لـ «التسجيل مسكّر حالياً» لحاله لما تسكّر التسجيل.
- **الإعدادات:** فتح وإغلاق التسجيل + رسالة الإغلاق (القواعد كمان بترفض التسجيل وهو مسكّر).

### إضافة أدمن (مرة وحدة لكل أدمن)

1. Firebase Console › **Authentication** › Get started › Sign-in method › فعّل **Email/Password**.
2. Authentication › Users › **Add user**: إيميل وكلمة سر الأدمن.
3. انسخ **User UID** تبعه.
4. Firestore › Start collection: اسمها `admins`، و Document ID = الـ UID، وضيف حقل مثلاً `role` = `admin`.
5. ادخل على `/admin` بالإيميل وكلمة السر.

لو دخلت بحساب مش مضاف، الصفحة بتعرضلك الـ UID تبعه عشان تنسخه للخطوة 4.

نسيت كلمة السر؟ اكتب الإيميل بصفحة الدخول واضغط «نسيت كلمة السر؟»، وبيوصلك رابط من Firebase.

### تجربة اللوحة محلياً

```bash
firebase emulators:start --project demo-bitlahia
```

```bash
powershell -File scripts/seed-emulator.ps1
```

السكربت بيعمل أدمن تجريبي على المحاكي بس (الإيميل وكلمة السر جوّا الملف).

## إيميلات Firebase باسم المجتمع (المشروع مشترك مع تطبيق الفلاتر)

المشروع `flutter-app-distribution-a4166` مشترك، فإيميلات مثل «تغيير كلمة السر» بتطلع باسمه إلا إذا غيّرته:

1. Project settings › General › **Public-facing name** = `Beit Lahia Tech` (هاد الاسم اللي بيطلع بالإيميلات).
2. Authentication › **Templates** › Password reset › عدّل **Sender name** لـ `بيت لاهيا تك`، وبتقدر تترجم النص للعربي.
3. (اختياري) بنفس الصفحة: **Customize domain** عشان الإيميل يطلع من `noreply@beitlahia.tech`. بيعطيك سجلات DNS بتضيفها بـ Cloudflare.

وقواعد Firestore مشتركة كمان: أي تعديل على `firestore.rules` بيأثر على تطبيق الفلاتر لو استخدم Firestore. فصل المشروع كلياً بيحتاج مشروع Firebase جديد (كوتا المشاريع كانت ممتلئة).

## مشاهدة التسجيلات

Firebase Console › Firestore Database › `members`. للتصدير لملف Excel/CSV بتقدر تستخدم BigQuery export أو سكربت صغير بـ Admin SDK.

## الحماية من التسجيلات الوهمية (App Check)

الكود جاهز ومطفي. شغّله لما تبدأ تنشر الرابط على نطاق واسع، أو أول ما تشوف تسجيلات وهمية:

1. اعمل مفتاح **reCAPTCHA v3** من https://www.google.com/recaptcha/admin، وحط الدومين `beit-lahia-tech.web.app`.
2. Firebase Console › **App Check** › Apps › اختار تطبيق الويب «Beit Lahia Tech» › reCAPTCHA v3 › الصق الـ **secret key**.
3. حط الـ **site key** بـ `public/firebase-config.js` بـ `appCheckSiteKey`، وارفع الموقع.
4. استنى يوم أو يومين، وشوف بـ App Check › APIs › Cloud Firestore إنه أغلب الطلبات «Verified».
5. بعدها اضغط **Enforce** على Cloud Firestore.

ملاحظة: reCAPTCHA بيزيد تحميل حوالي 150KB على كل صفحة، عشان هيك مطفي لحد ما تحتاجه.

## السرعة: شو بيتحمّل وإمتى

1. الصفحة نفسها (HTML + `styles.css` + كود الموقع) — هاد الوحيد اللي بيأخر العرض.
2. الخطوط من Google Fonts بتتحمّل بدون ما توقف العرض (النص بيبيّن فوراً بخط النظام وبعدين بيتبدّل).
3. مكتبة Firebase بتتحمّل **بعد** ما الصفحة تخلص وبوقت فراغ المتصفح، وبالنسخة الخفيفة (`firestore-lite`).
4. آخر محتوى من لوحة الإدارة بينحفظ بمتصفح الزائر، فبالزيارة الثانية بيبيّن فوراً بدون نت، وبيتحدّث بالخلفية.

## صورة المشاركة (og.png)

مصدرها `design/og.html`. لإعادة توليدها بعد تعديل:

```bash
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --hide-scrollbars --window-size=1200,630 --virtual-time-budget=8000 --screenshot="public\og.png" "file:///D:/bitlahia/design/og.html"
```

## حماية إضافية (مستحسن قبل النشر الواسع)

- فعّل **App Check** مع reCAPTCHA Enterprise عشان تمنع البوتات تضيف تسجيلات من برا الموقع.
- النموذج فيه honeypot مخفي ضد البوتات البسيطة، والقواعد بترفض أي بيانات بشكل غلط.
