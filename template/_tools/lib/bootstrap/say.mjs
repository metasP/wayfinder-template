// สองตัวที่ทุกขั้นของ bootstrap ใช้พูด — bootstrap.mjs กับ lib/bootstrap/* ใช้ตัวเดียวกัน
export const log = (s = '') => console.log(s)
export const die = (msg, code = 1) => { console.error(`❌ ${msg}`); process.exit(code) }
