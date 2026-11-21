// إعدادات تطبيق الويب (Firebase Console › Project settings › Your apps › Web app). هاي القيم مش سرية.
// مكتوبة هون عشان كل صفحة توفّر طلب /__/firebase/init.json. إذا خلّيتها null، بتنقرأ من هناك تلقائياً.
export const firebaseConfig = {
  apiKey: 'AIzaSyBvmOjQzWXzfTBHa5WTfzHfqYciIvH9eW0',
  appId: '1:909098243797:web:942eb214da46a83fbb745c',
  authDomain: 'flutter-app-distribution-a4166.firebaseapp.com',
  messagingSenderId: '909098243797',
  projectId: 'flutter-app-distribution-a4166',
  storageBucket: 'flutter-app-distribution-a4166.firebasestorage.app',
  measurementId: 'G-69C16QSFHF',
};

// حماية App Check ضد التسجيلات الوهمية (reCAPTCHA v3).
// فاضي = مطفي. لتشغيله: شوف README › «الحماية من التسجيلات الوهمية».
// الـ site key مش سري (بيبان بالمتصفح أصلاً)؛ الـ secret key بيروح لـ Firebase Console بس، مش هون.
export const appCheckSiteKey = '';
