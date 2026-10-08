"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  FileText, Printer, Car, User, DollarSign, Eye, Sun, Moon, ZoomIn, ZoomOut, PenLine, LayoutTemplate,
} from "lucide-react";

/* =====================================================================
 * ค่าหน้ากระดาษ — วัดจากไฟล์ Word ต้นฉบับ (บันทึกข้อตกลงใช้รถไฟฟ้า)
 *   - กระดาษ A4, ฟอนต์ TH SarabunPSK ขนาด 16 pt ทั้งฉบับ
 *   - ขอบ บน 1440 / ขวา 1376 / ล่าง 1701 / ซ้าย 1440 twips
 *   - (เวอร์ชันนี้) ไม่แสดงเลขหน้า และแปะรูปหัว/ท้ายกระดาษบริษัทบนทุกหน้า
 * ทุกค่าใช้หน่วยจริง (mm / pt) เพื่อให้ "หน้าจอแก้ไข" = "ตัวอย่าง" = "PDF"
 * ===================================================================== */
const PAGE_W = 210; // mm
const PAGE_H = 297; // mm
const M_TOP = 32; // เว้นให้พ้นหัวกระดาษ (เส้นเขียวใต้โลโก้อยู่ที่ ~27 มม.)
const M_RIGHT = 24.3;
const M_BOTTOM = 30;
const M_LEFT = 25.4;
/** ชุดหัว/ท้ายกระดาษที่เลือกได้ (ปุ่มเลือกอยู่บนแถบเครื่องมือหน้าตัวอย่าง)
 *  head/foot = path รูปใน public/  | headW/footW = ความกว้างรูปบนกระดาษ (มม.) ความสูงคำนวณตามสัดส่วนรูป
 *  headTop = ระยะรูปหัวจากขอบบนกระดาษ (มม.) ยิ่งมากรูปยิ่งเลื่อนลง (ควรเพิ่ม mTop ตามไปด้วย)
 *  company = ชื่อบริษัทที่แสดงในเนื้อหาและบล็อกลายเซ็น | office = ข้อความที่อยู่สำนักงานในย่อหน้าคู่สัญญา
 *  mTop/mBottom = ขอบบน/ล่างของเนื้อหา (มม.) ต้องมากกว่าความสูงรูปหัว/ท้าย ไม่งั้นข้อความจะทับรูป
 *  เพิ่มหัวใหม่ได้โดยเพิ่ม object ในลิสต์นี้ */
type Letterhead = {
  id: string; label: string; company: string; office: string; head: string; foot: string;
  headW: number; footW: number; headTop: number; mTop: number; mBottom: number;
};
const LETTERHEADS: Letterhead[] = [
  { id: "com7", label: "COM7", company: "บริษัท คอมเซเว่น จำกัด (มหาชน)",
    office: "สำนักงาน ตั้งอยู่เลขที่ 549/1 ถนนสรรพาวุธ แขวงบางนาใต้ เขตบางนา กรุงเทพมหานคร",
    head: "/img/com/com7head.png", foot: "/img/com/com7foot.png",
    headW: 210, footW: 210, headTop: 0, mTop: M_TOP, mBottom: M_BOTTOM },
  { id: "ufun", label: "UFUN", company: "บริษัท ยูฟัน แคปปิตอล จำกัด",
    office: "สำนักงาน ตั้งอยู่เลขที่ 549/1 ถนนสรรพาวุธ แขวงบางนาใต้ เขตบางนา กรุงเทพมหานคร", // TODO: แก้เป็นที่อยู่สำนักงานของ ยูฟัน แคปปิตอล
    head: "/img/ufun/ufunhead.png", foot: "/img/ufun/ufunfoot.png",
    headW: 210, footW: 210, headTop: 8, mTop: 40, mBottom: 30 },
];
const FOOT_BOTTOM_MM = 0; // ระยะรูปท้ายจากขอบล่างกระดาษ
const CONTENT_W = +(PAGE_W - M_LEFT - M_RIGHT).toFixed(2); // 160.3 mm
const COLUMN_GAP = 20; // mm ระยะห่างระหว่าง "หน้า" ภายในตัวจัดหน้า (ต้องมากกว่า BLEED)
const BLEED = 10; // mm เผื่อให้ตารางที่กว้างกว่าพื้นที่เนื้อหาไม่ถูกตัด

const FONT_PT = 16; // ขนาดตัวอักษรเนื้อหา
const LINE_PT = 18.4; // ระยะบรรทัด (single spacing ของ TH Sarabun 16pt)
const INDENT_MM = 12.7; // ย่อหน้าบรรทัดแรก 720 twips
const SIGN_INDENT_MM = 50.8; // บล็อกลายเซ็น (2160 + 720 twips)

/** ถ้าเครื่องไม่มีฟอนต์ TH Sarabun จะใช้ Google "Sarabun" ซึ่งตัวใหญ่กว่า จึงย่อลงเล็กน้อย
 *  (ค่าประมาณ — ถ้าวางไฟล์ฟอนต์ใน /public/fonts จะไม่ต้องใช้ค่านี้) */
const FALLBACK_SCALE = 0.85;

const MM_PX = 96 / 25.4;
const STEP_MM = CONTENT_W + COLUMN_GAP;

/* ===================== ข้อมูลในฟอร์ม ===================== */
const INITIAL = {
  docDate: "10 ตุลาคม 2567",
  employeeName: "สมชาย ใจดี",
  address: "123/45 ถนนสุขุมวิท แขวงบางนา เขตบางนา กรุงเทพมหานคร 10260",
  carModel: "Max 600",
  engineNo: "ENG-2024-9981",
  chassisNo: "CHA-AION-881234",
  exteriorColor: "ขาว (White)",
  interiorColor: "ดำ (Black)",
  licensePlate: "1กข 8899 กรุงเทพมหานคร",
  extraEquipment: "ฟิล์มกรองแสง V-Kool, กล้องบันทึกหน้า-หลัง",
  deductionAmount: "3,300",
  deductionMonths: "48",
  depositAmount: "50,000",
  depositAmountText: "ห้าหมื่นบาทถ้วน",
  depositDate: "1 ตุลาคม 2567",
  supervisorName: "สมศักดิ์ ผู้จัดการ",
  companySignerName: "นาย ภาคภูมิ เสตะรัต",
  witness1Name: "นาย ณัฐพล ธนัชธรรมนพ",
  witness2Name: "นางสาว อรพิมพ์ ทวีผล",
};
type FormData = typeof INITIAL;
type FieldKey = keyof FormData;

/** แท็บหนึ่งแท็บ = เอกสารของพนักงานหนึ่งคน */
type DocTab = { id: string; data: FormData };

/** ช่องที่ "ไม่ควรซ้ำกัน" ระหว่างพนักงาน จะถูกล้างให้ว่างเมื่อสร้างแท็บใหม่
 *  (ช่องอื่น เช่น วันที่ ผู้บังคับบัญชา เงื่อนไขหักเงิน จะคัดลอกจากแท็บปัจจุบัน) */
const PER_PERSON: FieldKey[] = ["address", "engineNo", "chassisNo", "licensePlate"];

/** แยกรายชื่อจากข้อความที่วาง: 1 บรรทัด = 1 คน (ตัดเลขลำดับหน้าชื่อ และรองรับการก๊อปจาก Excel) */
const parseNames = (text: string) =>
  text
    .split(/\r?\n/)
    .map((s) =>
      s
        .split("\t")[0]
        .replace(/^\s*"(.*)"\s*$/, "$1") // Google Sheets ใส่ " ครอบช่องที่มีอักขระพิเศษ
        .replace(/^\s*\d+\s*[.)]\s*/, "")
        .trim()
    )
    .filter(Boolean);

type FieldDef = {
  name: FieldKey;
  label: string;
  multiline?: boolean;
  full?: boolean;
  placeholder?: string;
};
type SectionDef = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  grid: boolean;
  fields: FieldDef[];
};

const SECTIONS: SectionDef[] = [
  {
    title: "1. ข้อมูลพนักงานและวันที่",
    icon: User,
    grid: false,
    fields: [
      { name: "docDate", label: "วันที่ทำหนังสือ", placeholder: "เช่น 10 ตุลาคม 2567" },
      {
        name: "employeeName",
        label: "ชื่อ-นามสกุล พนักงาน",
        placeholder: "วางรายชื่อหลายบรรทัดเพื่อสร้างแท็บอัตโนมัติ",
      },
      { name: "address", label: "ที่อยู่ตามทะเบียนบ้าน/ปัจจุบัน", multiline: true },
    ],
  },
  {
    title: "2. ข้อมูลรถยนต์ไฟฟ้า (AION)",
    icon: Car,
    grid: true,
    fields: [
      { name: "carModel", label: "รุ่นรถ (AION ...)" },
      { name: "licensePlate", label: "หมายเลขทะเบียน" },
      { name: "engineNo", label: "หมายเลขเครื่องยนต์" },
      { name: "chassisNo", label: "หมายเลขตัวถัง" },
      { name: "exteriorColor", label: "สีภายนอก" },
      { name: "interiorColor", label: "สีภายใน" },
      { name: "extraEquipment", label: "อุปกรณ์เพิ่มเติม", full: true },
    ],
  },
  {
    title: "3. เงื่อนไขค่าบริการและเงินประกัน",
    icon: DollarSign,
    grid: true,
    fields: [
      { name: "deductionAmount", label: "หักค่าสึกหรอ (บาท/เดือน)" },
      { name: "deductionMonths", label: "ระยะเวลา (เดือน)" },
      { name: "depositAmount", label: "เงินประกัน (บาท)" },
      { name: "depositAmountText", label: "เงินประกัน (ตัวอักษร)" },
      { name: "depositDate", label: "วันที่ชำระเงินประกัน", full: true },
    ],
  },
  {
    title: "4. ผู้ลงลายมือชื่อ",
    icon: PenLine,
    grid: false,
    fields: [
      { name: "supervisorName", label: "ผู้บังคับบัญชา / พยาน" },
      { name: "companySignerName", label: "ผู้แทนบริษัท" },
      { name: "witness1Name", label: "พยาน คนที่ 1" },
      { name: "witness2Name", label: "พยาน คนที่ 2" },
    ],
  },
];

const FIELD_LABELS = SECTIONS.flatMap((s) => s.fields).reduce(
  (acc, f) => ({ ...acc, [f.name]: f.label }),
  {} as Record<FieldKey, string>
);

type Highlight = (field: FieldKey, placeholder?: string) => React.ReactNode;

const DOTS = "........................";
const DOTS_LONG = "....................................................";

/* =====================================================================
 * เนื้อหาเอกสาร — ถูก render ซ้ำหลายสำเนา (หนึ่งสำเนาต่อหนึ่งหน้า A4)
 * ===================================================================== */
function DocBody({ d, hl, co }: { d: FormData; hl: Highlight; co: Letterhead }) {
  const Blank = () => <div className="d-blank" />;
  return (
    <>
      <p className="d-title">
        หนังสือรับทราบและยินยอมปฏิบัติตามเงื่อนไขโครงการรถยนต์ไฟฟ้าส่วนกลาง
      </p>
      <Blank />

      <p className="d-p">
        หนังสือรับทราบฉบับนี้ทำขึ้น ณ {co.company} เมื่อวันที่{" "}
        {hl("docDate")} ระหว่าง
      </p>
      <Blank />

      <p className="d-p">
        <b>{co.company}</b> {co.office} ซึ่งต่อไปในหนังสือรับทราบนี้จะเรียกว่า
        “บริษัท” ฝ่ายหนึ่ง กับ
      </p>
      <p className="d-p">
        {hl("employeeName", DOTS_LONG)} อยู่บ้านเลขที่ {hl("address", DOTS_LONG)}{" "}
        ซึ่งต่อไปในหนังสือรับทราบนี้จะเรียกว่า “พนักงาน” อีกฝ่ายหนึ่ง
      </p>
      <Blank />
      <p className="d-p">
        ทั้งสองฝ่ายตกลงทำหนังสือรับทราบฉบับนี้ขึ้น มีรายละเอียดดังต่อไปนี้
      </p>
      <Blank />

      {/* ข้อ 1 */}
      <p className="d-h">ข้อ 1. รายละเอียดรถยนต์ไฟฟ้า</p>
      <p className="d-p">
        บริษัทตกลงมอบรถยนต์ไฟฟ้าส่วนกลางให้พนักงานได้ใช้ประโยชน์
        และพนักงานตกลงใช้ประโยชน์ในรถยนต์ไฟฟ้าส่วนกลาง ยี่ห้อ AION รุ่น{" "}
        {hl("carModel")} จำนวน 1 คัน ตามรายละเอียดของรถยนต์ที่ปรากฏในตารางด้านล่างนี้
        (ต่อไปในหนังสือรับทราบนี้จะเรียกรถยนต์ไฟฟ้าคันดังกล่าวว่า “รถยนต์”)
        ซึ่งบริษัทเป็นเจ้าของกรรมสิทธิ์และ/หรือเป็นผู้มีสิทธิตามกฎหมายในการให้พนักงานได้ใช้ประโยชน์ในรถยนต์
        ทั้งนี้เพื่อวัตถุประสงค์ในการให้พนักงานใช้รถยนต์เป็นพาหนะในการปฏิบัติงาน
        ซึ่งบริษัทตกลงส่งมอบและพนักงานตกลงรับมอบรถยนต์ ในเวลาและสถานที่ตามที่บริษัทกำหนด
        โดยพนักงานมีสิทธิซื้อรถยนต์ให้เป็นกรรมสิทธิ์ของตนเองเมื่อครบกำหนดเวลาของการใช้ประโยชน์ในรถยนต์แล้ว
        ภายใต้เงื่อนไขดังที่กำหนดในหนังสือรับทราบนี้ โดยรายละเอียดของรถยนต์มีดังต่อไปนี้:
      </p>
      <Blank />

      <table className="d-table">
        <colgroup>
          <col style={{ width: "20.9%" }} />
          <col style={{ width: "34.3%" }} />
          <col style={{ width: "17.9%" }} />
          <col style={{ width: "26.9%" }} />
        </colgroup>
        <tbody>
          <tr>
            <td className="lbl">ยี่ห้อ</td>
            <td className="lbl">AION</td>
            <td className="lbl">รุ่นรถ</td>
            <td>{hl("carModel", "-")}</td>
          </tr>
          <tr>
            <td className="lbl">หมายเลขเครื่องยนต์</td>
            <td>{hl("engineNo", "-")}</td>
            <td className="lbl">หมายเลขตัวถัง</td>
            <td>{hl("chassisNo", "-")}</td>
          </tr>
          <tr>
            <td className="lbl">สีภายนอก</td>
            <td>{hl("exteriorColor", "-")}</td>
            <td className="lbl">สีภายใน</td>
            <td>{hl("interiorColor", "-")}</td>
          </tr>
          <tr>
            <td className="lbl">หมายเลขทะเบียน</td>
            <td colSpan={3}>{hl("licensePlate", "-")}</td>
          </tr>
          <tr>
            <td className="lbl">อุปกรณ์เพิ่มเติม</td>
            <td colSpan={3}>{hl("extraEquipment", "-")}</td>
          </tr>
        </tbody>
      </table>
      <Blank />

      {/* ข้อ 2 */}
      <p className="d-h">ข้อ 2. การชำระเงินค่าสึกหรอของรถยนต์</p>
      <p className="d-p">
        พนักงานรับทราบว่าในการใช้ประโยชน์รถยนต์ พนักงานมีสิทธิเบิกค่าเดินทางรายเดือนในอัตรา 4.00
        บาทต่อการใช้ประโยชน์รถยนต์หนึ่งกิโลเมตร
        ซึ่งพนักงานตกลงให้บริษัทหักค่าเดินทางดังกล่าวทุกๆวันสิ้นเดือน
        เป็นค่าสึกหรอและเสื่อมค่าของรถยนต์ในอัตรา 3.30 บาทต่อหนึ่งกิโลเมตร จนครบจำนวน{" "}
        {hl("deductionAmount")} บาทต่อเดือน ตลอดระยะเวลาของการใช้ประโยชน์รถยนต์
        ซึ่งกำหนดไว้ว่ามีระยะเวลา {hl("deductionMonths", "........")} เดือน
        นับจากวันที่พนักงานรับมอบรถยนต์เป็นต้นไป
      </p>
      <p className="d-p">
        ในกรณีที่พนักงานมีหนี้สินอื่นใดตามที่กำหนดในหนังสือรับทราบนี้อยู่กับบริษัท
        พนักงานตกลงยินยอมให้บริษัทหักค่าเดินทางตามอัตราและวิธีการที่กำหนดในวรรคก่อนจนกว่าจะชำระหนี้ที่ค้างชำระอยู่ครบถ้วน
      </p>
      <p className="d-p">
        หากการชำระเงินค่าสึกหรอและเสื่อมค่าของรถยนต์ด้วยวิธีการข้างต้น
        ไม่สามารถดำเนินการได้เกินกว่า 2 เดือนติดต่อกัน
        พนักงานจะต้องนำรถยนต์มาคืนให้กับบริษัทตามสถานที่ที่บริษัทกำหนด อย่างไรก็ดี
        บริษัทมีสิทธิดำเนินการยึดรถยนต์รวมถึงดำเนินการอย่างอื่นในทุกประการเพื่อให้การกลับเข้าครอบครองรถยนต์เป็นผลสำเร็จ
        โดยพนักงานตกลงสละสิทธิในการเรียกร้องค่าเสียหายและดำเนินการทางกฎหมายกับบริษัทหรือผู้ดำเนินการทั้งสิ้น
      </p>
      <p className="d-p">
        เพื่อเป็นประกันความเสียหายและสูญหายใดๆของการใช้ประโยชน์ในรถยนต์ พนักงานตกลงชำระเงินจำนวน{" "}
        {hl("depositAmount")} บาท ({hl("depositAmountText", DOTS_LONG)}) ให้แก่บริษัท ในวันที่{" "}
        {hl("depositDate")} เงินประกันดังกล่าว เมื่อหนังสือรับทราบนี้สิ้นสุดลง
        พนักงานตกลงให้เป็นสิทธิของบริษัทในการริบทั้งจำนวนหากพนักงานปฏิบัติผิดหนังสือรับทราบนี้ข้อหนึ่งข้อใด
        หรือให้ถือเป็นค่ารถยนต์ที่จะตกเป็นกรรมสิทธิ์ของพนักงานตามที่ระบุไว้ในข้อ 1.
        ของหนังสือรับทราบนี้ กรณีที่พนักงานปฏิบัติตามหนังสือรับทราบนี้โดยครบถ้วน
      </p>
      <Blank />

      {/* ข้อ 3 */}
      <p className="d-h">ข้อ 3. การประกันภัยรถยนต์</p>
      <p className="d-p">
        ในระหว่างที่พนักงานยังชำระค่าสึกหรอของรถยนต์อยู่
        บริษัทจะจัดทำประกันภัยรถยนต์ภาคบังคับและภาคสมัครใจและส่งมอบกรมธรรม์ประกันภัยให้กับพนักงาน
        โดยพนักงานเป็นผู้รับผิดชอบชำระค่าเบี้ยประกันภัยทั้งหมดสำหรับการประกันภัยดังกล่าว
        ในกรณีที่มีอุปกรณ์ตกแต่งเพิ่มเติม
        หรือทรัพย์สินอื่นใดที่พนักงานประสงค์จะให้มีความคุ้มครองเพิ่มเติม
        พนักงานจะเป็นผู้รับผิดชอบจัดทำประกันภัยและชำระค่าเบี้ยประกันภัยในส่วนดังกล่าวเอง
      </p>
      <p className="d-p">
        หากพนักงานหรือหรือบริวารของพนักงานหรือบุคคลใดที่เกี่ยวข้องกับพนักงานเป็นฝ่ายก่อให้เกิดอุบัติเหตุหรือทำให้เกิดอุบัติเหตุ
        เป็นเหตุให้รถยนต์ตามข้อ 1.เกิดความเสียหายอย่างใดๆ
        และบริษัทประกันภัยผู้รับประกันภัยไม่รับผิดชอบชดใช้ค่าเสียหาย
        เพราะเกิดกรณีประพฤติผิดเงื่อนไขตามข้อกำหนดในกรมธรรม์ประกันภัยหรือไม่อยู่ในการคุ้มครองตามกรมธรรม์ประกันภัย
        พนักงานยินยอมรับผิดชดใช้ค่าเสียหายตามที่เกิดขึ้นจริงแก่บริษัทจนครบจำนวน
      </p>
      <Blank />

      {/* ข้อ 4 */}
      <p className="d-h">ข้อ 4. การบำรุงรักษารถยนต์</p>
      <p className="d-p">
        พนักงานตกลงนำรถยนต์เข้าตรวจเช็ค และบำรุงรักษาตามระยะทางและกำหนดเวลา
        รวมถึงตามสถานที่ที่บริษัทกำหนดอย่างเคร่งครัด
        และตกลงเป็นผู้รับผิดชอบค่าใช้จ่ายดังกล่าวทั้งหมดแต่เพียงฝ่ายเดียว ทั้งนี้ หากมีความเสียหาย
        ค่าใช้จ่าย หรือภาระใด ๆ อันเกิดจากหรือเกี่ยวเนื่องกับการนำรถยนต์เข้ารับการตรวจเช็คระยะล่าช้า
        หรือค่าใช้จ่ายอื่นใดที่อยู่นอกขอบเขตการรับประกัน รวมถึงค่าอะไหล่สิ้นเปลือง
        พนักงานเป็นผู้รับผิดชอบชำระทั้งสิ้น
      </p>
      <p className="d-p">
        ในกรณีรถยนต์สูญหายหรือเสียหายเนื่องจากการกระทำโดยเจตนาหรือประมาทเลินเล่ออย่างร้ายแรงของพนักงานหรือผู้ขับขี่รถยนต์
        และ/หรือบริษัทประกันภัยได้ปฏิเสธการจ่ายค่าสินไหมทดแทนหรือค่าเสียหายจากความสูญหายหรือเสียหายที่เกิดขึ้นไม่ว่าทั้งหมดหรือบางส่วน
        พนักงานมีหน้าที่ในการชำระเงินส่วนต่างของราคารถยนต์ตามราคาตลาดกับค่าสินไหมทดแทนที่บริษัทและ/หรือบุคคลที่บริษัทกำหนดได้รับจากบริษัทประกันภัย
      </p>
      <Blank />

      {/* ข้อ 5 */}
      <p className="d-h">ข้อ 5. หน้าที่ของพนักงาน</p>
      <p className="d-p">
        ในระหว่างที่รถยนต์ยังไม่โอนกรรมสิทธิ์ไปที่พนักงานตามรายละเอียดในหนังสือรับทราบนี้
        พนักงานตกลงว่าจะใช้ประโยชน์และดูแลรักษารถยนต์ตามข้อ 1. เป็นอย่างดี
        เสมือนเป็นรถยนต์ของพนักงานเอง นอกจากนี้ พนักงานตกลงว่า
      </p>
      <p className="d-p">
        5.1 ค่าไฟฟ้าในการชาร์จรถยนต์ และค่าเชื้อเพลิงอื่นๆ(หากมี) พนักงานเป็นผู้รับผิดชอบ
      </p>
      <p className="d-p">5.2 พนักงานจะต้องมีใบอนุญาตขับขี่ที่ถูกต้องตามกฎหมาย</p>
      <p className="d-p">
        5.3 พนักงานจะไม่นำหรือยินยอมให้ผู้ใดนำรถยนต์ไปใช้ผิดจากวัตถุประสงค์ตามที่ระบุไว้ในข้อ 1.
        และจะใช้รถยนต์ด้วยตนเอง
        โดยไม่บรรทุกสิ่งของที่ผิดกฎหมายและนำรถยนต์ไปใช้ในทางที่ผิดต่อศีลธรรมอันดีของประชาชน
        ไม่บรรทุกน้ำหนักเกินกว่าที่กฎหมายกำหนดรวมทั้งไม่นำไปใช้ในการกระทำความผิดต่อกฎหมายใด ๆ
        โดยเด็ดขาด หากพนักงานฝ่าฝืนกฎจราจรใดๆ พนักงานจะต้องรับผิดชอบชำระค่าปรับดังกล่าวด้วยตนเอง
        ทั้งนี้ หากการฝ่าฝืนดังกล่าวเป็นเหตุให้บริษัทได้รับความเสียหายใด ๆ
        พนักงานจะต้องชำระค่าเสียหายให้กับบริษัทและบุคคลผู้เกี่ยวข้องตามความเสียหายที่เกิดขึ้นจริง
      </p>
      <p className="d-p">
        5.4 พนักงานจะไม่ทำการต่อเติม ดัดแปลง หรือแก้ไขเปลี่ยนแปลงสภาพรถยนต์ในทุกกรณี
        เว้นแต่จะได้รับความยินยอมเป็นลายลักษณ์อักษรล่วงหน้าจากบริษัท ทั้งนี้หากพนักงานได้ทำการต่อเติม
        ดัดแปลง หรือแก้ไขเปลี่ยนแปลงรถยนต์โดยไม่ได้รับความยินยอมจากบริษัทดังกล่าว
        บริษัทมีสิทธิรื้อถอนและแก้ไขส่วนที่เปลี่ยนแปลงหรือต่อเติมดังกล่าวให้คืนสู่สภาพเดิมได้
        โดยพนักงานจะต้องรับผิดชำระค่าใช้จ่ายที่เกิดขึ้นจากการรื้อถอนและแก้ไข
        และหากการรื้อถอนแก้ไขนั้นทำให้เกิดความเสียหายกับรถยนต์บริษัทมีสิทธิเรียกร้องค่าเสียหายที่เกิดขึ้นทั้งหมดจากพนักงานได้ทั้งสิ้น
      </p>
      <p className="d-p">
        5.5 พนักงานมีหน้าที่นำรถยนต์เข้าเช็คระยะตามกำหนดของบริษัทโดยเคร่งครัด
        หากเกิดความเสียหายจากความล่าช้าในการนำรถยนต์เข้าเช็คระยะ พนักงานจะต้องเป็นผู้รับผิดชอบ
      </p>
      <p className="d-p">
        5.6 พนักงานรับทราบและตกลงปฏิบัติตามข้อกำหนดของการใช้ประโยชน์รถยนต์
        และเงื่อนไขของการใช้ประโยชน์ในรถยนต์ที่อาจแก้ไขปรับปรุงเปลี่ยนแปลงโดยบริษัทได้ในอนาคต
        ซึ่งบริษัทจะแจ้งให้ทราบล่วงหน้าก่อนบังคับใช้
      </p>
      <Blank />

      {/* ข้อ 6 */}
      <p className="d-h">ข้อ 6. คำรับรองของพนักงาน</p>
      <p className="d-p">
        พนักงานรับรองว่าข้อมูลเกี่ยวกับพนักงานที่ได้ให้ไว้กับบริษัท(หากมี)เป็นข้อมูลที่ถูกต้อง
        ครบถ้วน และเป็นปัจจุบัน
        ในกรณีที่มีข้อมูลที่เป็นเท็จและ/หรือบริษัทพบว่าพนักงานมีข้อมูลประวัติอาชญากรรมที่ไม่พึงประสงค์ไม่ว่าในระยะเวลาใดระหว่างที่รถยนต์ยังไม่โอนกรรมสิทธิ์ไปที่พนักงาน
        บริษัทขอสงวนสิทธิในการยกเลิกหนังสือรับทราบนี้โดยไม่ต้องรับผิดใดๆ
        ซึ่งพนักงานจะต้องนำรถมาคืนแก่บริษัททันที
      </p>
      <p className="d-p">
        พนักงานรับรองแก่บริษัทจะไม่ดำเนินการใดๆอันเป็นเหตุที่ทำให้บริษัทไม่ได้รับเงินจากการใช้ประโยชน์ในรถยนต์และ/หรือทำให้บริษัทไม่สามารถนำเงินค่าตอบแทนพิเศษของพนักงานมาชำระเป็นค่าสึกหรอให้กับบริษัทได้ทั้งหมดหรือบางส่วน
        การรับรองดังกล่าวให้หมายความรวมถึงการที่เจ้าหนี้อื่นใดของพนักงาน ยึด อายัด
        บังคับชำระหนี้ด้วยวิธีการใดทำให้พนักงานไม่มีจำนวนเงินเพียงพอต่อการชำระเงินให้กับบริษัทด้วย
      </p>
      <Blank />

      {/* ข้อ 7 */}
      <p className="d-h">ข้อ 7. การสิ้นสุดจากการเป็นพนักงาน</p>
      <p className="d-p">
        ในกรณีที่พนักงานลาออกหรือถูกเลิกจ้างหรือสิ้นสุดสัญญาจ้าง
        หรือมีเหตุอื่นใดอันมีผลให้บริษัทไม่สามารถได้รับเงินค่าสึกหรอจากพนักงานจนครบกำหนดระยะเวลาของการใช้ประโยชน์ในรถยนต์ตามหนังสือรับทราบนี้ได้
        ให้ถือว่าหนังสือรับทราบฉบับนี้สิ้นสุดลงโดยทันที
        เว้นแต่บริษัทจะตกลงเป็นอย่างอื่นเป็นลายลักษณ์อักษรกับพนักงาน กรณีดังกล่าว
        พนักงานจะต้องแจ้งความประสงค์เกี่ยวกับการดำเนินการกับรถยนต์ตามทางวิธีการอย่างใดอย่างหนึ่ง
        ดังต่อไปนี้เท่านั้น
      </p>
      <Blank />
      <p className="d-h">7.1 ปิดยอดและโอนกรรมสิทธิ์</p>
      <p className="d-p">
        พนักงานมีสิทธิเลือกชำระเงินค่าสึกหรอรถยนต์ตามมูลค่าที่คงเหลือของระยะเวลาของการใช้ประโยชน์ในรถยนต์ซึ่งบริษัทกำหนด
        รวมทั้งค่าใช้จ่าย ค่าธรรมเนียม ภาษี อากร และหนี้อื่นใดที่เกี่ยวข้องกับรถยนต์ตามที่บริษัทแจ้ง
        เพื่อปิดบัญชีทั้งหมด และเมื่อพนักงานได้ชำระเงินครบถ้วนแล้ว
        บริษัทจะดำเนินการโอนกรรมสิทธิ์รถยนต์ให้แก่พนักงาน ทั้งนี้
        ค่าใช้จ่ายในการโอนกรรมสิทธิ์และค่าใช้จ่ายที่เกี่ยวข้องทั้งหมดให้อยู่ในความรับผิดชอบของพนักงาน
        เว้นแต่บริษัทจะแจ้งเป็นอย่างอื่น หรือ
      </p>
      <p className="d-h">7.2 ทำสัญญาเช่าซื้อ</p>
      <p className="d-p">
        พนักงานมีสิทธิเลือกเช่าซื้อรถยนต์ภายหลังสิ้นสุดความเป็นพนักงาน
        โดยพนักงานอาจยื่นคำขอเช่าซื้อรถยนต์กับสถาบันการเงินหรือนิติบุคคลที่ให้สินเชื่อเช่าซื้อรถยนต์
        ทั้งนี้ ในการเลือกวิธีการดังกล่าว พนักงานจะต้องผ่านการพิจารณาคุณสมบัติ
        ความสามารถในการชำระหนี้ รวมถึงเงื่อนไขอื่นใดตามที่ผู้ให้สินเชื่อเช่าซื้อรถยนต์กำหนดด้วย หรือ
      </p>
      <p className="d-h">7.3 คืนรถยนต์และสิ้นสุดสัญญา</p>
      <p className="d-p">
        พนักงานมีสิทธิเลือกคืนรถยนต์ โดยพนักงานจะต้องส่งมอบรถยนต์พร้อมอุปกรณ์ เอกสาร
        และกุญแจรถยนต์คืนแก่บริษัทตามสถานที่และวันเวลาที่บริษัทกำหนด ทั้งนี้
        พนักงานตกลงรับผิดชอบค่าใช้จ่ายส่วนเกินอันเกิดจากผลต่างของมูลค่ารถยนต์ ณ วันที่คืนรถ
        ค่าเสื่อมสภาพจากการใช้รถยนต์ที่เกินกว่าการใช้งานตามปกติ ค่าเสียหาย ค่าซ่อมแซม
        ค่าขาดประโยชน์ ค่าใช้จ่ายในการติดตามรถยนต์คืน
        และค่าใช้จ่ายอื่นใดที่เกี่ยวข้องตามที่บริษัทคำนวณและแจ้งให้ทราบ
        โดยที่พนักงานรับทราบว่าในการคำนวณค่าใช้จ่ายส่วนเกินตามที่ระบุข้างต้น
        บริษัทจะใช้หลักเกณฑ์ วิธีคำนวณ
        และการประเมินมูลค่ารถยนต์ตามสภาพตลาดหรือหลักเกณฑ์ภายในของบริษัท
        ซึ่งพนักงานตกลงยอมรับผลการประเมินดังกล่าวว่าเป็นที่สุด
      </p>
      <Blank />
      <p className="d-p">
        ในกรณีที่พนักงานไม่แจ้งความประสงค์ของการดำเนินการกับรถยนต์ตามวิธีใดวิธีหนึ่งที่ระบุข้างต้น
        ภายในเวลาที่บริษัทกำหนด พนักงานตกลงให้บริษัทถือว่าพนักงานเลือกใช้วิธีการตามข้อ 7.3
        ซึ่งพนักงานมีหน้าที่ต้องส่งคืนรถยนต์แก่บริษัททันที หากพนักงานไม่ส่งคืนรถยนต์ภายในกำหนด
        บริษัทมีสิทธิติดตามรถยนต์คืนได้รวมถึงดำเนินการอื่นใดเพื่อให้การกลับเข้าครอบครองรถยนต์มีผลสมบูรณ์
        ซึ่งพนักงานจะต้องรับผิดชอบค่าใช้จ่ายและความเสียหายทั้งหมดที่เกิดขึ้นจากการไม่ยอมคืนรถยนต์ดังกล่าว
      </p>
      <Blank />

      {/* ข้อ 8 */}
      <p className="d-h">ข้อ 8. การส่งมอบรถยนต์คืน</p>
      <p className="d-p">
        เมื่อหนังสือรับทราบนี้สิ้นสุดลงไม่ว่าด้วยสาเหตุใด(ยกเว้นกรณีพนักงานชำระค่าสึกหรอในรถยนต์โดยครบถ้วน)
        พนักงานจะต้องส่งมอบรถยนต์คืนแก่บริษัทรวมถึงต้องจัดส่งอุปกรณ์รถยนต์อย่างครบถ้วนในสภาพดีและใช้งานได้ปกติ
        ภายในระยะเวลาและสถานที่ที่บริษัทกำหนด
        กรณีพนักงานคืนหรือส่งมอบไม่ครบถ้วนหรือเกิดการชำรุดบกพร่องใดๆกับรถยนต์
        พนักงานจะต้องชดใช้ค่าเสียหายตามส่วนให้แก่บริษัท ทั้งนี้ยกเว้นกรณีการเสื่อมสภาพตามการใช้งานปกติ
      </p>
      <Blank />

      {/* ข้อ 9 */}
      <p className="d-h">ข้อ 9. การประพฤติผิดหนังสือรับทราบ</p>
      <p className="d-p">
        โดยไม่เป็นกระทบกระเทือนต่อข้อกำหนดของข้อ 7.ของหนังสือรับทราบนี้
        หากการชำระเงินค่าสึกหรอรถยนต์ไม่สามารถดำเนินการได้ไม่ว่าด้วยสาเหตุใดเกินกว่า 2 (สอง)
        เดือนติดต่อกันไม่ว่าด้วยสาเหตุใด หรือพนักงานประพฤติผิดหนังสือรับทราบนี้ข้อหนึ่งข้อใด
        หรือเกิดกรณีผิดคำรับรองของพนักงาน ให้ถือว่าหนังสือรับทราบนี้สิ้นสุดลงทันที
        หรือในกรณีที่พนักงานบอกเลิกหนังสือรับทราบฉบับนี้ก่อนครบกำหนดเวลาที่ระบุในหนังสือรับทราบนี้
        พนักงานตกลงคืนรถยนต์ให้แก่บริษัททันที
        กรณีที่พนักงานไม่คืนรถยนต์ให้กับบริษัทหลังจากสิ้นสุดหนังสือรับทราบหรือบอกเลิกหนังสือรับทราบ
        พนักงานยินยอมให้บริษัทคิดค่าเสียหายเท่ากับค่าสึกหรอรถยนต์รายเดือนพร้อมค่าชดเชยการขาดประโยชน์และค่าใช้จ่ายในการติดตามในอัตราร้อยละ
        15 ต่อปี
        นับตั้งแต่วันที่ผิดนัดเป็นต้นไปจนกว่าบริษัทจะได้กลับเข้าครอบครองซึ่งรถยนต์
        โดยที่พนักงานจะต้องชำระค่าเสียหายและค่าใช้จ่ายใดๆที่เกิดขึ้นอันเกิดจากการติดตามเอาคืนซึ่งรถยนต์
        หรือการขนส่งรถยนต์มาที่บริษัทด้วย
      </p>
      <Blank />

      {/* ข้อ 10 */}
      <p className="d-h">ข้อ 10. การติดต่อบอกกล่าว</p>
      <p className="d-p">
        การติดต่อสื่อสารใดๆที่บริษัทมีถึงพนักงาน
        หากได้ส่งไปยังที่อยู่ตามที่ได้ให้ไว้ในหนังสือรับทราบนี้
        หรือที่ได้ประกาศแจ้งให้ทราบผ่านทางสื่อออนไลน์ หมายเลขโทรศัพท์มือถือ
        แอพพลิเคชั่นใดๆบนโทรศัพท์มือถือ แท็บเลต
        หรืออุปกรณ์ติดรถยนต์อย่างอื่น ให้ถือว่าพนักงานได้รับทราบแล้วโดยชอบ
        ซึ่งพนักงานจะไม่ปฏิเสธการไม่รับทราบถึงข้อความ
        หรือการบอกกล่าวใดด้วยวิธีการติดต่อสื่อสารดังกล่าว และให้ถือว่าพนักงานได้รับทราบแล้ว
      </p>
      <Blank />

      {/* ข้อ 11 */}
      <p className="d-h">ข้อ 11. เหตุสุดวิสัย</p>
      <p className="d-p">
        ในกรณีที่เกิดเหตุสุดวิสัยได้แก่ น้ำท่วม ไฟไหม้ ภัยธรรมชาติ
        หรือมีเหตุใดๆอันจะเกิดขึ้นก็ดี จะให้ผลพิบัติก็ดี
        เป็นเหตุที่ไม่อาจป้องกันได้แม้ทั้งบุคคลผู้ต้องประสบหรือใกล้จะต้องประสบเหตุนั้นจะได้จัดการระมัดระวังตามสมควรอันพึงคาดหมายได้จากบุคคลในฐานะและภาวะเช่นนั้นส่งผลให้รถยนต์สูญหายหรือเสียหาย
        หากความสูญหายหรือเสียหายดังกล่าวไม่อยู่ในความคุ้มครองของกรมธรรม์ประกันภัยของรถยนต์ไม่ว่าทั้งหมดหรือบางส่วน
        พนักงานตกลงรับผิดชอบในส่วนของความเสียหายที่เกิดขึ้นดังกล่าวทั้งสิ้น
      </p>
      <Blank />

      <p className="d-p">
        หนังสือรับทราบนี้จัดทำขึ้นเป็นสองฉบับ มีข้อความที่ถูกต้องตรงกัน
        ทั้งสองฝ่ายได้อ่านข้อความในหนังสือรับทราบนี้โดยละเอียดแล้ว
        เห็นว่าถูกต้องตามความประสงค์ทุกประการ จึงได้ลงลายมือชื่อพร้อมประทับตรา (ถ้ามี)
        ไว้เป็นสำคัญต่อหน้าพยาน
      </p>
      <Blank />

      {/* ลายมือชื่อ — จัดเรียงตามต้นฉบับ (ซ้อนลงมา เยื้องซ้าย 50.8 มม.) และไม่ให้ขาดข้ามหน้า */}
      <div className="d-sigblock">
        <div className="d-sig">
          <p>ลงชื่อ………………………………พนักงาน</p>
          <p>( {hl("employeeName", DOTS_LONG)} )</p>
        </div>
        <Blank />
        <div className="d-sig">
          <p>ลงชื่อ…………………ผู้บังคับบัญชา/พยาน</p>
          <p>( {hl("supervisorName", DOTS_LONG)} )</p>
        </div>
        <Blank />
        <div className="d-sig">
          <p>
            <b>{co.company}</b>
          </p>
          <Blank />
          <p>ลงชื่อ………………………………บริษัท</p>
          <p>( {hl("companySignerName", DOTS_LONG)} )</p>
        </div>
        <Blank />
        <div className="d-sig">
          <p>ลงชื่อ………………………………พยาน</p>
          <p>( {hl("witness1Name", DOTS_LONG)} )</p>
        </div>
        <Blank />
        <div className="d-sig">
          <p>ลงชื่อ………………………………พยาน</p>
          <p>( {hl("witness2Name", DOTS_LONG)} )</p>
        </div>
      </div>
    </>
  );
}

/* =====================================================================
 * CSS — เอกสาร (A4) ใช้ชุดเดียวกันทั้งหน้าแก้ไข / ตัวอย่าง / พิมพ์ PDF
 * วิธีแบ่งหน้า: เนื้อหาไหลเป็น "คอลัมน์" สูงเท่าพื้นที่เนื้อหา A4 แล้ว
 * ตัดแสดงทีละคอลัมน์เป็น 1 หน้า → ขอบ/เลขหน้า/การตัดบรรทัดเหมือนกันทุกหน้า
 * ===================================================================== */
const DOC_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap');

/* ถ้ามีไฟล์ฟอนต์ TH Sarabun New วางที่ /public/fonts/ จะถูกใช้อัตโนมัติ (แนะนำ เพื่อให้ตรงกับ Word 100%) */
@font-face { font-family: "TH Sarabun Embedded"; font-weight: 400; font-display: swap;
  src: url("/fonts/THSarabunNew.woff2") format("woff2"), url("/fonts/THSarabunNew.ttf") format("truetype"); }
@font-face { font-family: "TH Sarabun Embedded"; font-weight: 700; font-display: swap;
  src: url("/fonts/THSarabunNew-Bold.woff2") format("woff2"), url("/fonts/THSarabunNew-Bold.ttf") format("truetype"); }

.doc-font {
  font-family: "TH Sarabun Embedded","TH SarabunPSK","TH Sarabun PSK","TH Sarabun New","THSarabunNew","Sarabun",sans-serif;
}

/* ---------- หน้ากระดาษ A4 (ห้ามครอบด้วย flex/grid: Chrome จะตัดหน้าตอนพิมพ์ผิด เกิดหน้าว่าง) ---------- */
.pages { display: block; }
.a4-page {
  position: relative; display: block;
  width: ${PAGE_W}mm; height: ${PAGE_H}mm;
  background: #fff; color: #000; overflow: hidden;
  margin: 0 auto 10mm;
  box-shadow: 0 1px 2px rgba(15,23,42,.08), 0 12px 32px rgba(15,23,42,.18);
  break-after: page; page-break-after: always; break-inside: avoid;
  animation: pageIn .5s cubic-bezier(.2,.8,.2,1) both;
}
.a4-page:last-child { margin-bottom: 0; break-after: auto; page-break-after: auto; }
.a4-head, .a4-foot { position: absolute; left: 50%; transform: translateX(-50%); height: auto; display: block;
  max-width: none; pointer-events: none; user-select: none; -webkit-user-drag: none; }
.a4-head { top: var(--head-top); width: var(--head-w); }
.a4-head.in { animation: lhHeadIn .55s cubic-bezier(.2,.8,.2,1) both; }
.a4-foot.in { animation: lhFootIn .55s cubic-bezier(.2,.8,.2,1) both; }
.a4-head.out, .a4-foot.out { animation: lhOut .45s ease forwards; }
.a4-viewport.lh-swap { animation: lhText .55s cubic-bezier(.2,.8,.2,1) .08s both; }
.a4-foot { bottom: ${FOOT_BOTTOM_MM}mm; width: var(--foot-w); }

/* หน้าต่างตัดเนื้อหา: กว้างกว่าพื้นที่เนื้อหาข้างละ ${BLEED}mm เพื่อไม่ตัดขอบตารางที่กว้างกว่าข้อความ
   (ยังน้อยกว่าระยะห่างคอลัมน์ ${COLUMN_GAP}mm จึงไม่เห็นข้อความหน้าอื่นเล็ดเข้ามา) */
.a4-viewport {
  position: absolute; overflow: hidden;
  top: var(--m-top); left: ${M_LEFT - BLEED}mm;
  width: ${CONTENT_W + BLEED * 2}mm; height: calc(${PAGE_H}mm - var(--m-top) - var(--m-bottom));
}
.a4-flow {
  margin-left: ${BLEED}mm;
  width: ${CONTENT_W}mm; height: 100%;
  column-width: ${CONTENT_W}mm; column-gap: ${COLUMN_GAP}mm; column-fill: auto;
  text-align: justify; text-justify: inter-character;
  overflow-wrap: break-word; word-break: normal;
}
.a4-measure {
  position: absolute; left: -99999px; top: 0; visibility: hidden; pointer-events: none;
  width: ${CONTENT_W}mm; height: calc(${PAGE_H}mm - var(--m-top) - var(--m-bottom)); overflow: hidden;
}
.a4-measure .a4-flow { margin-left: 0; }

/* ---------- องค์ประกอบเอกสาร ---------- */
.a4-flow p { margin: 0; orphans: 2; widows: 2; }
.d-title { text-align: center !important; font-weight: 700; }
.d-p { text-indent: ${INDENT_MM}mm; }
.d-h { margin-left: ${INDENT_MM}mm !important; font-weight: 700; break-after: avoid; }
.d-blank { height: ${LINE_PT}pt; }
.d-table { width: 167.5mm; margin-left: -2.6mm; border-collapse: collapse; table-layout: fixed; break-inside: avoid; text-align: left; }
.d-table td { border: 0.5pt solid #000; padding: 0 1.5mm; vertical-align: top; }
.d-table td.lbl { text-align: center; }
.d-table tr { break-inside: avoid; }
.d-sigblock { break-inside: avoid; text-align: left; }
.d-sig { margin-left: ${SIGN_INDENT_MM}mm; width: max-content; max-width: calc(100% - ${SIGN_INDENT_MM}mm); text-align: center; }
.d-sig p { overflow-wrap: anywhere; }

/* ---------- จุดที่แก้ไขได้ + เคอร์เซอร์บนเอกสาร ----------
   ตัวหนาเสมอ (ตรงต้นฉบับ Word) ไฮไลต์/เคอร์เซอร์ไม่กระทบขนาดหรือตำแหน่งข้อความ */
.doc-field { font-weight: 700; cursor: pointer; }
.doc-caret { display: inline-block; width: 0; height: 0; position: relative; vertical-align: baseline; pointer-events: none; }
.doc-caret::after {
  content: ""; position: absolute; left: -1px; bottom: -0.28em; width: 2px; height: 1.25em;
  background: #4f46e5; border-radius: 2px;
  box-shadow: 0 0 0 3px rgba(79,70,229,.18);
  animation: caretBlink 1.05s ease-in-out infinite;
}
@media screen {
  .doc-field {
    text-decoration: underline dotted rgba(100,116,139,.7); text-underline-offset: 4px;
    background: rgba(253, 224, 71, .20); border-radius: 3px;
    -webkit-box-decoration-break: clone; box-decoration-break: clone;
    transition: background .25s ease, box-shadow .25s ease;
  }
  .doc-field:hover { background: rgba(253, 224, 71, .55); }
  .doc-field.is-active {
    background: rgba(253, 224, 71, .75); text-decoration: none;
    box-shadow: 0 0 0 2px rgba(245,158,11,.9);
    animation: fieldPulse 1.8s ease-in-out infinite;
  }
}

@keyframes lhHeadIn { from { opacity: 0; transform: translateX(-50%) translateY(-14px); filter: blur(3px); } to { opacity: 1; transform: translateX(-50%) translateY(0); filter: blur(0); } }
@keyframes lhFootIn { from { opacity: 0; transform: translateX(-50%) translateY(14px); filter: blur(3px); } to { opacity: 1; transform: translateX(-50%) translateY(0); filter: blur(0); } }
@keyframes lhOut { from { opacity: 1; } to { opacity: 0; } }
@keyframes lhText { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes pageIn { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes caretBlink { 0%, 45% { opacity: 1; } 55%, 95% { opacity: .05; } 100% { opacity: 1; } }
@keyframes fieldPulse { 0%,100% { box-shadow: 0 0 0 2px rgba(245,158,11,.9), 0 0 0 0 rgba(245,158,11,.35); }
                        50% { box-shadow: 0 0 0 2px rgba(245,158,11,.9), 0 0 0 7px rgba(245,158,11,0); } }
`;

/* =====================================================================
 * CSS — ส่วนหน้าตาโปรแกรม (ธีม สว่าง/มืด) ไม่เกี่ยวกับตัวเอกสาร
 * ===================================================================== */
const UI_CSS = `
.ui-root {
  --bg:#eef1f7; --bg2:#e3e8f3; --panel:#ffffff; --panel2:#f6f8fc; --text:#0f172a; --muted:#64748b;
  --border:#e2e8f0; --accent:#4f46e5; --accent2:#7c3aed; --accent-soft:#eef2ff; --ok:#059669;
  --ring:rgba(79,70,229,.28); --stage:#d9dfec; --shadow:0 1px 2px rgba(15,23,42,.05),0 8px 24px rgba(15,23,42,.06);
  --glass:rgba(255,255,255,.78);
  font-family: 'Sarabun', system-ui, sans-serif; color: var(--text); background: var(--bg);
  min-height: 100vh; transition: background .35s ease, color .35s ease;
  background-image: radial-gradient(900px 400px at 85% -10%, rgba(124,58,237,.10), transparent 60%),
                    radial-gradient(700px 380px at -5% 0%, rgba(79,70,229,.10), transparent 60%);
}
.ui-root[data-theme="dark"] {
  --bg:#0b1020; --bg2:#0f1630; --panel:#131a30; --panel2:#182040; --text:#e8ebf7; --muted:#8e97b5;
  --border:#252e4d; --accent:#8b93ff; --accent2:#c084fc; --accent-soft:#1d2551; --ok:#34d399;
  --ring:rgba(139,147,255,.35); --stage:#070b17; --shadow:0 1px 2px rgba(0,0,0,.4),0 10px 30px rgba(0,0,0,.35);
  --glass:rgba(15,21,42,.72);
}
.ui-root *, .ui-root *::before, .ui-root *::after { box-sizing: border-box; }
.ui-root button { font-family: inherit; cursor: pointer; }

/* header */
.ui-header {
  position: sticky; top: 0; z-index: 50; height: 64px; display: flex; align-items: center; justify-content: space-between;
  padding: 0 24px; background: var(--glass); backdrop-filter: saturate(160%) blur(14px); -webkit-backdrop-filter: saturate(160%) blur(14px);
  border-bottom: 1px solid var(--border); transition: background .35s, border-color .35s;
}
.ui-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.ui-logo {
  width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; color: #fff; flex: none;
  background: linear-gradient(135deg, var(--accent), var(--accent2)); box-shadow: 0 6px 16px var(--ring);
}
.ui-title { font-weight: 700; font-size: 17px; line-height: 1.2; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ui-sub { font-size: 12px; color: var(--muted); margin: 0; }
.ui-actions { display: flex; align-items: center; gap: 10px; }

.ui-btn {
  display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--border); background: var(--panel); color: var(--text);
  height: 38px; padding: 0 14px; border-radius: 11px; font-size: 14px; font-weight: 600;
  transition: transform .18s cubic-bezier(.2,.8,.2,1), box-shadow .25s ease, background .25s ease, border-color .25s ease, color .25s;
}
.ui-btn:hover { transform: translateY(-1px); box-shadow: var(--shadow); border-color: var(--accent); }
.ui-btn:active { transform: translateY(0) scale(.97); }
.ui-btn.icon { width: 38px; padding: 0; justify-content: center; }
.ui-btn.primary {
  border: 0; color: #fff; background: linear-gradient(135deg, var(--accent), var(--accent2)); box-shadow: 0 8px 20px var(--ring);
}
.ui-btn.primary:hover { box-shadow: 0 12px 28px var(--ring); filter: brightness(1.06); }
.ui-btn:focus-visible, .ui-input:focus-visible { outline: 3px solid var(--ring); outline-offset: 1px; }

.ui-seg { display: none; background: var(--panel2); border: 1px solid var(--border); padding: 3px; border-radius: 11px; position: relative; }
.ui-seg button { position: relative; z-index: 1; border: 0; background: transparent; color: var(--muted); font-size: 13px; font-weight: 600; padding: 6px 12px; border-radius: 8px; transition: color .25s, background .25s; }
.ui-seg button.on { color: #fff; background: linear-gradient(135deg, var(--accent), var(--accent2)); box-shadow: 0 4px 12px var(--ring); }

/* tabs (แท็บพนักงานแบบ Chrome) */
.ui-tabs { display: flex; align-items: flex-end; gap: 4px; height: 44px; padding: 8px 24px 0; overflow-x: auto; scrollbar-width: none;
  background: var(--bg2); border-bottom: 1px solid var(--border); }
.ui-tabs::-webkit-scrollbar { display: none; }
.ui-tab { display: flex; align-items: center; gap: 8px; flex: 0 1 200px; min-width: 110px; height: 36px; padding: 0 10px 0 12px;
  border-radius: 10px 10px 0 0; border: 1px solid transparent; border-bottom: 0; color: var(--muted); font-size: 13.5px; font-weight: 600;
  cursor: pointer; user-select: none; transition: background .2s, color .2s; }
.ui-tab:hover { background: var(--panel2); }
.ui-tab.on { background: var(--bg); color: var(--accent); border-color: var(--border); height: 37px; }
.ui-tab svg { flex: none; }
.ui-tab .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ui-tab .x { flex: none; width: 20px; height: 20px; border: 0; border-radius: 50%; background: transparent; color: inherit; font-size: 16px; line-height: 1; }
.ui-tab .x:hover { background: var(--border); }
.ui-tab-add { flex: none; width: 32px; height: 32px; margin-bottom: 2px; border: 0; border-radius: 50%; background: transparent; color: var(--muted); font-size: 20px; }
.ui-tab-add:hover { background: var(--panel2); color: var(--accent); }

/* workspace */
.ui-workspace { display: grid; grid-template-columns: minmax(340px, 440px) minmax(0, 1fr); gap: 20px; padding: 20px 24px; height: calc(100vh - 64px - 44px); }
.ui-pane { min-height: 0; overflow-y: auto; overflow-x: hidden; scroll-behavior: smooth; scrollbar-width: thin; scrollbar-color: var(--border) transparent; padding-right: 4px; }
.ui-pane.stage { overflow: auto; padding: 0; border-radius: 16px; background: var(--stage); border: 1px solid var(--border); transition: background .35s; display: flex; flex-direction: column; }
.ui-pane.stage-scroll { flex: 1; min-height: 0; overflow: auto; scroll-behavior: smooth; padding: 22px 16px 40px; }

/* progress */
.ui-progress { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 14px 16px; margin-bottom: 16px; box-shadow: var(--shadow); }
.ui-progress-row { display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.ui-progress-row span:last-child { color: var(--muted); font-weight: 500; }
.ui-bar { height: 8px; border-radius: 99px; background: var(--panel2); overflow: hidden; }
.ui-bar i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--accent), var(--accent2)); transition: width .6s cubic-bezier(.2,.8,.2,1); }

/* cards */
.ui-card {
  background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 18px; margin-bottom: 16px; box-shadow: var(--shadow);
  transition: border-color .3s, box-shadow .3s, transform .3s, background .35s; animation: cardIn .5s cubic-bezier(.2,.8,.2,1) both;
}
.ui-card:focus-within { border-color: var(--accent); box-shadow: 0 0 0 4px var(--ring), var(--shadow); }
.ui-card h2 { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; margin: 0 0 14px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
.ui-card h2 .ico { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }
.ui-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ui-stack { display: grid; gap: 14px; }
.ui-span2 { grid-column: span 2; }
.ui-label { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px; transition: color .2s; }
.ui-label i { width: 6px; height: 6px; border-radius: 50%; background: var(--border); transition: background .3s, transform .3s; }
.ui-label i.filled { background: var(--ok); }
.ui-field.on .ui-label { color: var(--accent); }
.ui-field.on .ui-label i { background: var(--accent); transform: scale(1.5); }
.ui-input {
  width: 100%; border: 1px solid var(--border); background: var(--panel2); color: var(--text); border-radius: 11px; padding: 10px 12px; font: inherit; font-size: 15px;
  outline: none; resize: vertical; transition: border-color .2s, box-shadow .25s, background .25s, transform .2s;
}
.ui-input::placeholder { color: var(--muted); opacity: .7; }
.ui-input:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
.ui-input:focus { border-color: var(--accent); background: var(--panel); box-shadow: 0 0 0 4px var(--ring); transform: translateY(-1px); }

/* stage toolbar */
.ui-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; background: var(--panel); border-bottom: 1px solid var(--border); flex: none; flex-wrap: wrap; transition: background .35s; }
.ui-toolbar .l { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 600; }
.ui-chip { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 600; padding: 5px 12px; border-radius: 99px; background: var(--panel2); color: var(--muted); border: 1px solid var(--border); transition: background .3s, color .3s, border-color .3s, transform .3s; max-width: 100%; }
.ui-chip.live { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
.ui-chip .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex: none; }
.ui-chip.live .dot { background: var(--accent); animation: dotPulse 1.4s ease-in-out infinite; }
.ui-tools { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.ui-lh { display: inline-flex; align-items: center; gap: 6px; padding: 3px 3px 3px 10px; border: 1px solid var(--border); border-radius: 11px; background: var(--panel2); color: var(--muted); }
.ui-lh-track { position: relative; display: inline-flex; --w: 66px; }
.ui-lh-track .ind {
  position: absolute; top: 0; bottom: 0; left: 0; width: var(--w); border-radius: 8px;
  background: linear-gradient(135deg, var(--accent), var(--accent2)); box-shadow: 0 4px 12px var(--ring);
  transform: translateX(calc(var(--i) * var(--w))); transition: transform .42s cubic-bezier(.34,1.35,.5,1);
}
.ui-lh button { position: relative; z-index: 1; width: var(--w); border: 0; background: transparent; color: var(--muted); font-size: 12.5px; font-weight: 700; padding: 5px 0; border-radius: 8px; transition: color .3s, transform .15s; }
.ui-lh button:hover { color: var(--accent); }
.ui-lh button:active { transform: scale(.94); }
.ui-lh button.on, .ui-lh button.on:hover { color: #fff; }
.ui-zoom { display: inline-flex; align-items: center; gap: 4px; }
.ui-zoom .pct { min-width: 48px; text-align: center; font-size: 12.5px; font-weight: 600; color: var(--muted); font-variant-numeric: tabular-nums; }
.ui-btn.sm { height: 32px; width: 32px; padding: 0; justify-content: center; border-radius: 9px; }
.ui-btn.sm.txt { width: auto; padding: 0 10px; font-size: 12.5px; }

.zoom-wrap { width: max-content; margin: 0 auto; }

.ui-fade { animation: fadeIn .35s ease both; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes cardIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes dotPulse { 0%,100% { box-shadow: 0 0 0 0 var(--ring); } 50% { box-shadow: 0 0 0 6px transparent; } }

@media (max-width: 1023px) {
  .ui-header { padding: 0 14px; }
  .ui-tabs { padding: 8px 12px 0; }
  .ui-sub, .ui-btn .lbl { display: none; }
  .ui-seg { display: inline-flex; }
  .ui-workspace { display: block; height: auto; padding: 12px; }
  .ui-pane { overflow: visible; padding: 0; }
  .ui-pane.stage-scroll { padding: 12px 6px 28px; overflow-x: auto; }
  .ui-pane.hide-sm { display: none; }
  .ui-pane.stage { overflow: visible; }
}
@media (prefers-reduced-motion: reduce) {
  .ui-root *, .ui-root *::before, .ui-root *::after, .a4-page, .doc-field, .doc-caret::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; scroll-behavior: auto !important; }
  .doc-caret::after { opacity: 1; }
}

/* ---------- พิมพ์ / บันทึกเป็น PDF ---------- */
@page { size: A4 portrait; margin: 0; }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; height: auto !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print, .a4-measure, .doc-caret { display: none !important; }
  .ui-root { background: #fff !important; min-height: 0 !important; }
  .ui-workspace, .ui-pane, .ui-pane.stage, .ui-pane.stage-scroll {
    display: block !important; position: static !important; height: auto !important; max-height: none !important;
    overflow: visible !important; margin: 0 !important; padding: 0 !important; border: 0 !important;
    background: #fff !important; box-shadow: none !important; border-radius: 0 !important;
  }
  .ui-pane.hide-sm { display: block !important; }
  /* ต้องอยู่หลังกฎ display:block ด้านบน และ specificity สูงกว่า เพื่อให้ฟอร์ม/แถบแท็บ/แถบเครื่องมือไม่ถูกพิมพ์ */
  .ui-root .no-print, .ui-root .ui-pane.no-print, .ui-root .ui-tabs, .ui-root .a4-measure { display: none !important; }
  .zoom-wrap { zoom: 1 !important; width: auto !important; margin: 0 !important; }
  .a4-page { margin: 0 !important; box-shadow: none !important; animation: none !important; opacity: 1 !important; transform: none !important;
             height: 296.5mm !important; /* เผื่อเศษทศนิยม ไม่ให้ล้นไปเป็นหน้าว่าง */ }
  .doc-field { background: none !important; box-shadow: none !important; text-decoration: none !important; animation: none !important; }
  .a4-head.out, .a4-foot.out { display: none !important; }
  .a4-head, .a4-foot, .a4-viewport { animation: none !important; filter: none !important; }
  .a4-head, .a4-foot { opacity: 1 !important; transform: translateX(-50%) !important; }
  .a4-viewport { opacity: 1 !important; transform: none !important; }
}
`;

/* =====================================================================
 * หน้าหลัก
 * ===================================================================== */
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** เลื่อนตำแหน่งเคอร์เซอร์ไปขอบเขตอักขระไทยที่ถัดไป (ไม่ให้เคอร์เซอร์คั่นกลางพยัญชนะ+สระ/วรรณยุกต์) */
function snapToCluster(text: string, index: number): number {
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: object) => { segment(s: string): Iterable<{ index: number }> } }).Segmenter;
  if (!Seg) return index;
  for (const s of new Seg("th", { granularity: "grapheme" }).segment(text)) {
    if (s.index >= index) return s.index;
  }
  return text.length;
}

export default function Home() {
  /* ---------- แท็บพนักงาน (1 แท็บ = 1 เอกสาร) ---------- */
  const [tabs, setTabs] = useState<DocTab[]>([{ id: "t0", data: INITIAL }]);
  const [docTabId, setDocTabId] = useState("t0");
  const idCounter = useRef(1);

  const currentTab = tabs.find((t) => t.id === docTabId) ?? tabs[0];
  const formData = currentTab.data;
  // ใช้ชื่อเดิม โค้ดส่วนอื่น (handleChange ฯลฯ) จึงไม่ต้องแก้
  const setFormData = (fn: (prev: FormData) => FormData) =>
    setTabs((ts) => ts.map((t) => (t.id === currentTab.id ? { ...t, data: fn(t.data) } : t)));

  const [activeField, setActiveField] = useState<FieldKey | null>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [letterheadId, setLetterheadId] = useState(LETTERHEADS[0].id);
  const letterhead = LETTERHEADS.find((l) => l.id === letterheadId) ?? LETTERHEADS[0];
  const [prevLh, setPrevLh] = useState<Letterhead | null>(null);
  const [swapN, setSwapN] = useState(0); // นับครั้งที่สลับ ใช้เป็น key เพื่อเล่นแอนิเมชันใหม่ทุกครั้ง
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pageCount, setPageCount] = useState(1);
  const [fontScale, setFontScale] = useState(FALLBACK_SCALE);
  const [fitZoom, setFitZoom] = useState(1);
  const [userZoom, setUserZoom] = useState<number | null>(null);

  const inputRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  const measureRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const lastFieldRef = useRef<FieldKey | null>(null);

  const zoom = userZoom ?? fitZoom;

  /* ---------- ธีม ---------- */
  useEffect(() => {
    try {
      const saved = localStorage.getItem("doc-theme");
      if (saved === "dark" || saved === "light") setTheme(saved);
      else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) setTheme("dark");
    } catch {}
  }, []);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("doc-letterhead");
      if (saved && LETTERHEADS.some((l) => l.id === saved)) setLetterheadId(saved);
    } catch {}
  }, []);
  const chooseLetterhead = (id: string) => {
    if (id === letterhead.id) return;
    setPrevLh(letterhead); // เก็บอันเดิมไว้ให้ค่อยๆ จางหาย (ครอสเฟด)
    setSwapN((n) => n + 1);
    setLetterheadId(id);
    try { localStorage.setItem("doc-letterhead", id); } catch {}
    if (swapTimer.current) clearTimeout(swapTimer.current);
    swapTimer.current = setTimeout(() => setPrevLh(null), 500);
  };
  useEffect(() => () => { if (swapTimer.current) clearTimeout(swapTimer.current); }, []);
  const toggleTheme = () =>
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try { localStorage.setItem("doc-theme", next); } catch {}
      return next;
    });

  /* ---------- ฟอร์ม + เคอร์เซอร์ ---------- */
  const syncCaret = (el: HTMLInputElement | HTMLTextAreaElement) => {
    setCaret(el.selectionStart ?? el.value.length);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    syncCaret(e.target);
  };

  /* ---------- จัดการแท็บ ---------- */
  const switchTab = (id: string) => {
    setDocTabId(id);
    setActiveField(null);
    setCaret(null);
  };

  const addTab = () => {
    const id = `t${idCounter.current++}`;
    const blank: FormData = { ...currentTab.data, employeeName: "" };
    PER_PERSON.forEach((k) => (blank[k] = ""));
    setTabs((ts) => {
      const i = ts.findIndex((t) => t.id === currentTab.id);
      return [...ts.slice(0, i + 1), { id, data: blank }, ...ts.slice(i + 1)];
    });
    switchTab(id);
  };

  const closeTab = (id: string) => {
    if (tabs.length === 1) return;
    const i = tabs.findIndex((t) => t.id === id);
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next);
    if (id === docTabId) switchTab(next[Math.max(0, i - 1)].id);
  };

  /** คนแรกใส่แท็บปัจจุบัน คนที่ 2..n สร้างแท็บใหม่ต่อท้าย */
  const importNames = (names: string[]) => {
    const base: FormData = { ...currentTab.data };
    PER_PERSON.forEach((k) => (base[k] = ""));
    const created: DocTab[] = names.slice(1).map((n) => ({
      id: `t${idCounter.current++}`,
      data: { ...base, employeeName: n },
    }));
    setTabs((ts) => {
      const i = ts.findIndex((t) => t.id === currentTab.id);
      const updated = ts.map((t) =>
        t.id === currentTab.id ? { ...t, data: { ...t.data, employeeName: names[0] } } : t
      );
      return [...updated.slice(0, i + 1), ...created, ...updated.slice(i + 1)];
    });
  };

  const handleNamePaste = (e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const names = parseNames(e.clipboardData.getData("text"));
    if (names.length < 2) return; // วางชื่อเดียว → ทำงานปกติ
    e.preventDefault();
    importNames(names);
  };

  const handleDocumentClick = useCallback((field: FieldKey) => {
    setActiveField(field);
    setActiveTab("edit");
    setTimeout(() => {
      const el = inputRefs.current[field];
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setCaret(el.selectionStart ?? el.value.length);
      }
    }, 50);
  }, []);

  /* ---------- สั่งพิมพ์ ---------- */
  const handlePrint = () => {
    const previous = document.title;
    const name = formData.employeeName.trim();
    document.title = `หนังสือรับทราบรถยนต์ไฟฟ้า${name ? "-" + name : ""}`;
    const restore = () => {
      document.title = previous;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  /* ---------- ตรวจว่าเครื่องมีฟอนต์ TH Sarabun หรือไม่ ---------- */
  useEffect(() => {
    let cancelled = false;
    const detect = () => {
      try {
        const ctx = document.createElement("canvas").getContext("2d");
        if (!ctx) return;
        const sample = "สวัสดีทดสอบฟอนต์ AaBbWw 123";
        const width = (family: string) => {
          ctx.font = `72px ${family}`;
          return ctx.measureText(sample).width;
        };
        const generics = ["monospace", "serif", "sans-serif"];
        const base = generics.map((g) => width(g));
        const names = ["TH Sarabun Embedded", "TH SarabunPSK", "TH Sarabun PSK", "TH Sarabun New", "THSarabunNew"];
        const found = names.some((n) => generics.some((g, i) => width(`"${n}",${g}`) !== base[i]));
        if (!cancelled) setFontScale(found ? 1 : FALLBACK_SCALE);
      } catch {
        /* ใช้ค่า fallback */
      }
    };
    const fonts = document.fonts;
    if (!fonts) return detect();
    Promise.allSettled([fonts.load('16px "TH Sarabun Embedded"')]).then(() => fonts.ready.then(detect));
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- วัดจำนวนหน้า ---------- */
  const measure = useCallback(() => {
    const flow = measureRef.current;
    if (!flow) return;
    const step = STEP_MM * MM_PX;
    // นับจากตำแหน่ง "บล็อกลายเซ็น" (ส่วนท้ายสุดของเอกสาร) ว่าอยู่คอลัมน์/หน้าที่เท่าไร
    // ไม่ใช้ scrollWidth เพราะถ้ามีองค์ประกอบใดล้นขอบขวา จะนับหน้าเกิน
    const end = flow.querySelector(".d-sigblock");
    let n: number;
    if (end) {
      const rects = end.getClientRects();
      const last = rects[rects.length - 1];
      n = Math.round((last.left - flow.getBoundingClientRect().left) / step) + 1;
    } else {
      n = Math.ceil((flow.scrollWidth - 2) / step);
    }
    n = Math.max(1, n);
    setPageCount((prev) => (prev === n ? prev : n));
  }, []);

  // วัดใหม่ทุกครั้งที่ข้อมูลเปลี่ยน หรือสลับแท็บ
  useIsoLayoutEffect(() => {
    measure();
  }, [formData, fontScale, letterhead, measure]);

  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return;
    fonts.ready.then(measure);
    fonts.addEventListener?.("loadingdone", measure);
    return () => fonts.removeEventListener?.("loadingdone", measure);
  }, [measure]);

  /* ---------- ย่อกระดาษให้พอดีความกว้างพื้นที่แสดง ---------- */
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width - 36;
      if (w > 0) setFitZoom(Math.min(1, Math.max(0.3, w / (PAGE_W * MM_PX))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const stepZoom = (dir: 1 | -1) =>
    setUserZoom(Math.min(1.6, Math.max(0.3, +(zoom + dir * 0.1).toFixed(2))));

  /* ---------- เลื่อนเอกสารตามเคอร์เซอร์ให้อยู่ในสายตาเสมอ ---------- */
  useEffect(() => {
    if (!activeField) {
      lastFieldRef.current = null;
      return;
    }
    const fieldChanged = lastFieldRef.current !== activeField;
    lastFieldRef.current = activeField;
    const id = requestAnimationFrame(() => {
      const scroller = stageRef.current;
      if (!scroller || scroller.clientHeight === 0) return;
      const carets = Array.from(scroller.querySelectorAll<HTMLElement>(".doc-caret"));
      const visible = carets.find((c) => {
        const vp = c.closest(".a4-page")?.querySelector(".a4-viewport");
        if (!vp) return false;
        const r = c.getBoundingClientRect();
        const v = vp.getBoundingClientRect();
        return r.left >= v.left - 2 && r.left <= v.right + 2 && r.top >= v.top - 2 && r.top <= v.bottom + 2;
      });
      if (!visible) return;
      const sr = scroller.getBoundingClientRect();
      const cr = visible.getBoundingClientRect();
      const rel = cr.top - sr.top;
      const margin = 90;
      if (fieldChanged || rel < margin || rel > scroller.clientHeight - margin) {
        scroller.scrollTo({ top: scroller.scrollTop + rel - scroller.clientHeight / 2, behavior: "smooth" });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [activeField, caret, formData]);

  /* ---------- ข้อความที่คลิกแก้ไขได้บนเอกสาร (พร้อมเคอร์เซอร์) ---------- */
  const hl: Highlight = (field, placeholder = DOTS) => {
    const value = formData[field];
    const active = activeField === field;
    let content: React.ReactNode = value || placeholder;
    if (active && caret !== null) {
      const at = value ? snapToCluster(value, Math.min(caret, value.length)) : 0;
      const mark = <span key={`c${at}-${value.length}`} className="doc-caret" aria-hidden />;
      // \u2060 (word joiner) กันไม่ให้เบราว์เซอร์ตัดบรรทัดตรงตำแหน่งเคอร์เซอร์ → ตัดบรรทัดเหมือนตอน export
      content = value ? (
        <>
          {value.slice(0, at)}
          {"\u2060"}
          {mark}
          {"\u2060"}
          {value.slice(at)}
        </>
      ) : (
        <>
          {mark}
          {placeholder}
        </>
      );
    }
    return (
      <span
        className={`doc-field${active ? " is-active" : ""}`}
        title="คลิกเพื่อแก้ไขจุดนี้"
        onClick={() => handleDocumentClick(field)}
      >
        {content}
      </span>
    );
  };

  const docStyle = {
    fontSize: `${FONT_PT * fontScale}pt`,
    lineHeight: `${LINE_PT}pt`,
    "--m-top": `${letterhead.mTop}mm`,
    "--m-bottom": `${letterhead.mBottom}mm`,
    "--head-w": `${letterhead.headW}mm`,
    "--head-top": `${letterhead.headTop}mm`,
    "--foot-w": `${letterhead.footW}mm`,
  } as React.CSSProperties;

  const allFields = SECTIONS.flatMap((s) => s.fields);
  const filled = allFields.filter((f) => formData[f.name].trim() !== "").length;
  const percent = Math.round((filled / allFields.length) * 100);

  return (
    <div className="ui-root" data-theme={theme}>
      <style dangerouslySetInnerHTML={{ __html: DOC_CSS + UI_CSS }} />

      {/* ตัววัดจำนวนหน้า (ไม่แสดงผล) */}
      <div className="a4-measure doc-font" aria-hidden lang="th" style={docStyle}>
        <div ref={measureRef} className="a4-flow">
          <DocBody d={formData} hl={hl} co={letterhead} />
        </div>
      </div>

      <header className="ui-header no-print">
        <div className="ui-brand">
          <div className="ui-logo">
            <FileText size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 className="ui-title">ระบบกรอกเอกสารรถยนต์ไฟฟ้า (AION)</h1>
            <p className="ui-sub">หนังสือรับทราบและยินยอมปฏิบัติตามเงื่อนไขโครงการรถยนต์ไฟฟ้าส่วนกลาง</p>
          </div>
        </div>
        <div className="ui-actions">
          <div className="ui-seg" role="tablist">
            {(
              [
                ["edit", "กรอกข้อมูล"],
                ["preview", "ตรวจทาน"],
              ] as const
            ).map(([key, text]) => (
              <button key={key} className={activeTab === key ? "on" : ""} onClick={() => setActiveTab(key)}>
                {text}
              </button>
            ))}
          </div>
          <button className="ui-btn icon" onClick={toggleTheme} title="สลับธีมสว่าง/มืด" aria-label="สลับธีม">
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button className="ui-btn primary" onClick={handlePrint}>
            <Printer size={17} />
            <span className="lbl">ส่งออกเป็น PDF / พิมพ์</span>
          </button>
        </div>
      </header>

      {/* แถบแท็บพนักงาน (แบบ Chrome) */}
      <div className="ui-tabs no-print" role="tablist">
        {tabs.map((t, i) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === currentTab.id}
            className={`ui-tab${t.id === currentTab.id ? " on" : ""}`}
            onClick={() => switchTab(t.id)}
            onAuxClick={(e) => e.button === 1 && closeTab(t.id)}
            title={t.data.employeeName || `คนที่ ${i + 1}`}
          >
            <User size={14} />
            <span className="t">{t.data.employeeName.trim() || `คนที่ ${i + 1}`}</span>
            {tabs.length > 1 && (
              <button
                className="x"
                aria-label="ปิดแท็บ"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button className="ui-tab-add" onClick={addTab} aria-label="เพิ่มแท็บ" title="เพิ่มพนักงาน">
          +
        </button>
      </div>

      <div className="ui-workspace">
        {/* ฟอร์ม */}
        <div className={`ui-pane no-print${activeTab === "preview" ? " hide-sm" : " ui-fade"}`}>
          <div className="ui-progress">
            <div className="ui-progress-row">
              <span>ความคืบหน้าการกรอก</span>
              <span>
                {filled}/{allFields.length} ช่อง · {percent}%
              </span>
            </div>
            <div className="ui-bar">
              <i style={{ width: `${percent}%` }} />
            </div>
          </div>

          {SECTIONS.map((section, si) => {
            const Icon = section.icon;
            return (
              <div key={section.title} className="ui-card" style={{ animationDelay: `${si * 70}ms` }}>
                <h2>
                  <span className="ico">
                    <Icon className="" />
                  </span>
                  {section.title}
                </h2>
                <div className={section.grid ? "ui-grid" : "ui-stack"}>
                  {section.fields.map((f) => {
                    const common = {
                      name: f.name,
                      value: formData[f.name],
                      onChange: handleChange,
                      onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                        setActiveField(f.name);
                        syncCaret(e.currentTarget);
                      },
                      onBlur: () => {
                        setActiveField(null);
                        setCaret(null);
                      },
                      onSelect: (e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                        syncCaret(e.currentTarget),
                      onKeyUp: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                        syncCaret(e.currentTarget),
                      onClick: (e: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                        syncCaret(e.currentTarget),
                      className: "ui-input",
                    };
                    return (
                      <div key={f.name} className={`ui-field${f.full ? " ui-span2" : ""}${activeField === f.name ? " on" : ""}`}>
                        <label className="ui-label">
                          <i className={formData[f.name].trim() ? "filled" : ""} />
                          {f.label}
                        </label>
                        {f.multiline ? (
                          <textarea
                            {...common}
                            rows={2}
                            ref={(el) => {
                              inputRefs.current[f.name] = el;
                            }}
                          />
                        ) : (
                          <input
                            {...common}
                            type="text"
                            placeholder={f.placeholder}
                            onPaste={f.name === "employeeName" ? handleNamePaste : undefined}
                            ref={(el) => {
                              inputRefs.current[f.name] = el;
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* ตัวอย่างเอกสาร A4 */}
        <div className={`ui-pane stage${activeTab === "edit" ? " hide-sm" : " ui-fade"}`}>
          <div className="ui-toolbar no-print">
            <div className="l">
              <Eye size={17} style={{ color: "var(--ok)" }} />
              ตัวอย่างเอกสารจริง · {pageCount} หน้า A4
            </div>
            <span className={`ui-chip${activeField ? " live" : ""}`}>
              <span className="dot" />
              {activeField ? `กำลังพิมพ์: ${FIELD_LABELS[activeField]}` : "คลิกจุดไฮไลต์บนเอกสารเพื่อแก้ไข"}
            </span>
            <div className="ui-tools">
            <div className="ui-lh" role="group" aria-label="เลือกหัวกระดาษ">
              <LayoutTemplate size={15} />
              <div
                className="ui-lh-track"
                style={{ "--i": LETTERHEADS.findIndex((l) => l.id === letterhead.id) } as React.CSSProperties}
              >
                <i className="ind" />
                {LETTERHEADS.map((l) => (
                  <button
                    key={l.id}
                    className={l.id === letterhead.id ? "on" : ""}
                    onClick={() => chooseLetterhead(l.id)}
                    title={`ใช้หัว-ท้ายกระดาษ ${l.label}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="ui-zoom">
              <button className="ui-btn sm" onClick={() => stepZoom(-1)} aria-label="ย่อ">
                <ZoomOut size={15} />
              </button>
              <span className="pct">{Math.round(zoom * 100)}%</span>
              <button className="ui-btn sm" onClick={() => stepZoom(1)} aria-label="ขยาย">
                <ZoomIn size={15} />
              </button>
              <button className="ui-btn sm txt" onClick={() => setUserZoom(null)}>
                พอดี
              </button>
            </div>
            </div>
          </div>

          <div ref={stageRef} className="ui-pane stage-scroll">
            <div className="zoom-wrap" style={{ zoom }}>
              <div className="pages">
                {Array.from({ length: pageCount }, (_, i) => (
                  <section key={i} className="a4-page doc-font" lang="th" style={docStyle}>
                    {prevLh && (
                      <>
                        <img className="a4-head out" src={prevLh.head} alt="" draggable={false}
                          style={{ top: `${prevLh.headTop}mm`, width: `${prevLh.headW}mm` }} />
                        <img className="a4-foot out" src={prevLh.foot} alt="" draggable={false}
                          style={{ width: `${prevLh.footW}mm` }} />
                      </>
                    )}
                    <img key={`h${swapN}`} className={`a4-head${swapN ? " in" : ""}`} src={letterhead.head} alt="" draggable={false} />
                    <img key={`f${swapN}`} className={`a4-foot${swapN ? " in" : ""}`} src={letterhead.foot} alt="" draggable={false} />
                    <div key={`v${swapN}`} className={`a4-viewport${swapN ? " lh-swap" : ""}`}>
                      <div className="a4-flow" style={{ transform: `translateX(-${i * STEP_MM}mm)` }}>
                        <DocBody d={formData} hl={hl} co={letterhead} />
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}