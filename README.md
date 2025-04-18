# سیستم مدیریت فایل

یک سیستم مدیریت فایل با ویژگی‌های کاربری و مدیریتی.

## ویژگی‌ها

- سیستم احراز هویت کاربران
- مدیریت کاربران (ایجاد، ویرایش، حذف)
- آپلود، دانلود، حذف و تغییر نام فایل‌ها
- ایجاد و مدیریت پوشه‌ها
- ثبت وقایع ورود و عملیات فایل
- پروفایل کاربری با امکان ویرایش اطلاعات
- پنل مدیریت

## پیش‌نیازها

- Node.js (نسخه 14 یا بالاتر)
- NPM (نسخه 6 یا بالاتر)

## نصب و راه‌اندازی

1. کلون کردن مخزن:
   ```
   git clone https://github.com/mohsen-rasouli/file-manager.git
   cd file-manager
   ```

2. نصب وابستگی‌ها:
   ```
   npm install
   ```

3. ساخت پوشه‌های مورد نیاز:
   ```
   mkdir -p db public/uploads
   ```

4. اجرای برنامه:
   ```
   npm start
   ```

5. برای توسعه و اجرا با قابلیت بارگذاری مجدد خودکار:
   ```
   npm run dev
   ```

6. مرورگر را باز کنید و به آدرس `http://localhost:3000` بروید.

## مسیرهای API

### احراز هویت
- `GET /auth/login` - صفحه ورود
- `POST /auth/login` - ورود به سیستم
- `GET /auth/register` - صفحه ثبت نام (فقط برای مدیران)
- `POST /auth/register` - ثبت نام کاربر جدید
- `GET /auth/logout` - خروج از سیستم

### مدیریت فایل‌ها
- `GET /files` - مشاهده فایل‌ها و پوشه‌ها
- `POST /files/folder` - ایجاد پوشه جدید
- `GET /files/folder/delete/:id` - حذف پوشه
- `POST /files/upload` - آپلود فایل
- `GET /files/delete/:id` - حذف فایل
- `POST /files/rename/:id` - تغییر نام فایل

### مدیریت کاربران (فقط مدیران)
- `GET /users` - لیست کاربران
- `GET /users/create` - فرم ایجاد کاربر
- `POST /users/create` - ایجاد کاربر جدید
- `GET /users/edit/:id` - فرم ویرایش کاربر
- `POST /users/edit/:id` - بروزرسانی اطلاعات کاربر
- `GET /users/delete/:id` - حذف کاربر
- `GET /users/logs/:id` - مشاهده گزارش‌های کاربر

### پروفایل کاربری
- `GET /profile` - مشاهده پروفایل
- `GET /profile/edit` - فرم ویرایش پروفایل
- `POST /profile/edit` - بروزرسانی پروفایل

## اطلاعات ورود پیش‌فرض

- **نام کاربری**: 09123456789
- **رمز عبور**: admin123

## تکنولوژی‌ها

- Node.js
- Express.js
- SQLite
- EJS
- Bootstrap 5
- Multer (برای آپلود فایل)
- Bcrypt (برای رمزنگاری)

