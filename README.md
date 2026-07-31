# تواصل ذكي للصم والبكم

موقع ويب (بدل النظارة الذكية) يستخدم **كاميرا وميكروفون اللابتوب** لتوفير تواصل ثنائي الاتجاه وتنبيهات سلامة.

## الميزات

1. **استقبال:** كلام عربي → نص حي على الشاشة (`faster-whisper`)
2. **إرسال:** لغة إشارة (مفردات محدودة) عبر الكاميرا → نص + نطق عربي (`MediaPipe` + `edge-tts`)
3. **سلامة:** رصد أصوات خطرة (صفارة، بوق، إنذار، جرس…) → تنبيه بصري

## المتطلبات

- Python 3.10+
- Node.js 18+
- كاميرا وميكروفون

## الاستضافة (Production)

- الواجهة: https://frontend-six-sandy-29.vercel.app
- الـ API: https://api-production-3b752.up.railway.app
- WebSocket: `wss://api-production-3b752.up.railway.app/ws/session`

افتح الموقع على HTTPS، اضغط **بدء الجلسة**، واسمح بالكاميرا والميكروفون.

## التشغيل المحلي

### 1) الخادم (Backend)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python scripts/prepare_sign_model.py
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

أول تشغيل لـ Whisper ينزّل نموذج `base` تلقائيًا.

### 2) الواجهة (Frontend)

```bash
cd frontend
npm install
npm run dev
```

افتح: [http://127.0.0.1:5173](http://127.0.0.1:5173)

## الاستخدام

1. اضغط **بدء الجلسة** واسمح بالكاميرا والميكروفون.
2. اختر وضعًا: الكل / استقبال / إرسال / سلامة.
3. تكلم بالعربية لرؤية الترجمة، أو أظهر إشارة يد واضحة، أو شغّل صوت صفارة/بوق لاختبار التنبيه.

### إشارات مدعومة (ديمو)

| الإشارة | الحركة التقريبية |
|---------|-------------------|
| مرحبا | كف مفتوح |
| نعم | إبهام لأعلى |
| لا | قبضة |
| شكرا | إبهام + خنصر |
| مساعدة | خنصر فقط |
| حسنا | دائرة OK |
| واحد…خمسة | عدد الأصابع |

## البنية

```
AI1212/
  backend/app/     # FastAPI + WebSocket + STT/Sign/Sound/TTS
  frontend/src/    # React + Vite (واجهة عربية RTL)
```

## ملاحظات

- التعرف على الإشارة لمفردات هندسية محدودة (للعرض)، وليس نموذج لغة إشارة كامل.
- يستخدم MediaPipe Tasks (Hand Landmarker). السكربت `prepare_sign_model.py` ينزّل النموذج تلقائيًا.
- إن ثبّتت `tensorflow` و`tensorflow-hub` يمكن تحميل YAMNet؛ وإلا يُستخدم كاشف طيفي احتياطي للصفارة/البوق/الإنذار/الجرس.
- يلزم `localhost` أو HTTPS لتفعيل الوسائط في المتصفح.
- أول طلب لـ Whisper ينزّل أوزان النموذج وقد يستغرق دقيقة.
# AIHAC
