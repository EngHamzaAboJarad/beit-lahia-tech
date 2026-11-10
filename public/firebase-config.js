// اتركه null: على Firebase Hosting الإعدادات بتنقرأ تلقائياً من /__/firebase/init.json
// إذا رفعت الموقع على استضافة غير Firebase، الصق هون الإعدادات من
// Firebase Console › Project settings › Your apps › Web app (هاي القيم مش سرية).
export const firebaseConfig = null;

// حماية App Check ضد التسجيلات الوهمية (reCAPTCHA v3).
// فاضي = مطفي. لتشغيله: شوف README › «الحماية من التسجيلات الوهمية».
// الـ site key مش سري (بيبان بالمتصفح أصلاً)؛ الـ secret key بيروح لـ Firebase Console بس، مش هون.
export const appCheckSiteKey = '';
