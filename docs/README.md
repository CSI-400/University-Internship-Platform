# สารบัญเอกสารออกแบบระบบ

เริ่มจากข้อกำหนดของ PM ใน [README.md](../README.md), [Verification Rules & Risk Score](<../Verification Rules & Risk Sco.txt>) และ [TODO.txt](../TODO.txt) แล้วอ่านเอกสาร SA ตามลำดับนี้:

| ลำดับ | เอกสาร | ใช้อ่านเรื่อง |
| --- | --- | --- |
| 1 | [System Architecture](architecture.md) | ขอบเขต 4 services, stack, เจ้าของข้อมูล และการไหลหลัก |
| 2 | [Design Diagrams](diagrams.md) | ภาพ 7 ประเภทที่ PM ขอ เรียง Use Case → Activity → Sequence → ER → Class → System Architecture → DFD; ภาพ State อยู่ท้ายไฟล์ |
| 3 | [API Contract v1](api-contract.md) | HTTP routes, request/response, สิทธิ์ และสถานะ |
| 4 | [Event Contract v1](event-contract.md) | Event payload, routing, retry และ DLQ |
| 5 | [Database Schema](database-schema.md) | ตารางและข้อบังคับของฐานข้อมูลแยกตาม service |
| 6 | [UI/UX Design](design.md) | สี องค์ประกอบ หน้าจอตามบทบาท และการแสดงสถานะตามกฎธุรกิจ |
| 7 | [Project Setup Handoff](project-setup.md) | วิธีรัน starter ด้วย Docker Compose, โครงสร้าง workspace และงานที่แต่ละทีมเริ่มต่อ |

`docs/` เป็นเอกสารออกแบบและ contract สำหรับทีม ส่วนไฟล์ที่ root เป็นภาพรวมและข้อกำหนดธุรกิจที่ PM ดูแล เมื่อเปลี่ยนกฎหรือ contract ให้ตรวจเอกสารและ diagram ที่อ้างถึงร่วมกันก่อนพัฒนา
