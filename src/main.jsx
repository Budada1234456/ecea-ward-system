import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Archive,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  Copy,
  Eye,
  ExternalLink,
  FileCheck2,
  FileDown,
  FileInput,
  FileText,
  FolderOpen,
  Home,
  Info,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  Megaphone,
  Menu,
  Plus,
  Phone,
  Search,
  Save,
  ScanText,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  UserPlus,
  X,
} from "lucide-react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import {
  DisciplineSelector,
  EntityEditor,
  StructuredTable,
  createDefaultPerson,
  createDefaultUnit,
  derivePrimaryDiscipline,
  normalizeApplicationData,
  normalizeDisciplineSelection,
} from "./forms/index.js";
import { getPdfFields } from "./schema/table-fields.js";
import { reorderAndRenumber, renumberItems } from "./utils/reorder.js";
import {
  CharacterCount,
  RichTextEditor,
  isHtmlContent,
  richTextToPlain,
  sanitizeRichText,
} from "./editor/index.jsx";
import { WordImportDialog } from "./import/WordImportDialog.jsx";
import {
  AWARD_TYPES,
  awardProfiles,
  getAwardProfile,
  getAwardSections,
} from "./award-profiles.js";
import {
  LONG_TEXT_LIMITS,
  validateApplication,
  validateSection,
} from "./forms/application-validation.js";
import { awardDisciplines } from "./data/award-disciplines.js";
import "./styles.css";

const awardOptions = awardProfiles.map((profile) => ({
  ...profile,
  mode: profile.mode === "individual" ? "个人奖" : "项目奖",
}));

const applicationChannels = [
  "科研院所、高等院校推荐",
  "行业、地方节能相关协会推荐",
  "节能减排领域相关企事业单位推荐",
  "自由申报",
];

const officialAwardUrl =
  "https://cecaweb.org.cn/navigationTemplate/index.php?portal_id=1&column_id=303&parent_id=110";

const referenceDocuments = [
  {
    title: "2026 年度中国节能协会创新奖申报工作通知",
    description: "奖项设置、核心条件、材料要求、时间安排、提交地址和联系方式。",
    href: "/materials/中国节能协会关于开展2026年度”中国节能协会创新奖“申报工作的通知-1.PDF",
    type: "申报通知",
  },
  {
    title: "中国节能协会创新奖奖励办法（2026 修订版）",
    description:
      "申报范围、奖项条件、奖励等级、评审程序、异议处理和科研诚信要求。",
    href: "/materials/附件1.中国节能协会创新奖奖励办法（2026修订版）-1.pdf",
    type: "奖励办法",
  },
  {
    title: "中国节能协会创新奖申报书",
    description:
      "协会统一格式的 Word 申报书模板，纸质版与电子版内容须完全一致。",
    href: "/materials/附件2.中国节能协会创新奖申报书.doc",
    type: "申报模板",
  },
  {
    title: "中国节能协会创新奖申报书填写说明",
    description: "逐栏目填写规范、字数限制、人员和单位要求以及附件目录。",
    href: "/materials/附件3.中国节能协会创新奖申报书填写说明-1.pdf",
    type: "填写说明",
  },
];

const sourceOptions = [
  ["A", "国家计划", "正式列入国家计划的项目"],
  ["B", "部委计划", "国务院各部委下达的任务"],
  ["C", "省、市、自治区计划", "地方政府或厅局下达的任务"],
  ["D", "基金资助", "国家自然科学基金及其他基金"],
  ["E", "企业", "企业自行出资研发项目"],
  ["F", "国际合作", "境外单位委托或共同研发"],
  ["G", "自选", "本单位提出或批准的项目"],
  ["H", "其他", "其他单位委托、非职务项目等"],
];

const industryOptions = [
  ["A", "农、林、牧、渔业"],
  ["B", "采矿业"],
  ["C", "制造业"],
  ["D", "电力、燃气及水的生产和供应业"],
  ["E", "建筑业"],
  ["F", "交通运输、仓储和邮政业"],
  ["G", "信息传输、计算机服务和软件业"],
  ["H", "批发和零售业"],
  ["I", "住宿和餐饮业"],
  ["J", "金融业"],
  ["K", "房地产业"],
  ["L", "租赁和商务服务业"],
  ["M", "科学研究、技术服务和地质勘查业"],
  ["N", "水利、环境和公共设施管理业"],
  ["O", "居民服务和其他服务业"],
  ["P", "教育"],
  ["Q", "卫生、社会保障和社会福利业"],
  ["R", "文化、体育和娱乐业"],
  ["S", "公共管理和社会组织"],
  ["T", "国际组织"],
];

function createEmptyData(meta = {}) {
  const profile = getAwardProfile(meta.award_type || meta.awardType);
  return {
    schemaVersion: 2,
    profileCode: profile.code,
    year: String(meta.year || 2026),
    awardType: profile.value,
    applicationMode: profile.mode,
    applicationChannel: "自由申报",
    projectName: meta.title || "",
    projectNameEn: "",
    candidate: {
      gender: "",
      birthDate: "",
      birthPlace: "",
      ethnicity: "",
      nativePlace: "",
      idNumber: "",
      politicalAffiliation: "",
      nationality: "中国",
      workUnit: "",
      administrativePosition: "",
      technicalTitle: "",
      education: "",
      highestDegree: "",
      graduateSchool: "",
      specialty: "",
      mailingAddress: "",
      postalCode: "",
      officePhone: "",
      mobilePhone: "",
      homePhone: "",
      email: "",
      graduationDate: "",
      homeAddress: "",
      socialPositions: "",
      academicPositions: "",
    },
    people: [],
    peopleCooperation: "",
    cooperationRecords: [],
    researchRecords: [],
    engineeringRecords: [],
    units: [],
    applicantUnit: "",
    contact: "",
    phone: "",
    email: "",
    disciplines: [],
    industry: "",
    sources: [],
    plans: "",
    startDate: "",
    endDate: "",
    introduction: "",
    background: "",
    technicalContent: "",
    innovations: "",
    comparison: "",
    application: "",
    economic: "",
    social: "",
    transformation: "",
    workSummary: "",
    resume: "",
    awardRecords: [],
    ipRecords: [],
    paperRecords: [],
    technicalEvaluation: "",
    applicationUnits: [],
    economicSummary: { totalInvestment: "", paybackYears: "" },
    economicRecords: [],
    unitContribution: "",
    recommendation: "",
    workflowMode: meta.workflowMode || "form",
  };
}

async function apiFetch(url, options) {
  const response = await fetch(url, options);
  if (response.status === 401) {
    window.dispatchEvent(new Event("auth-expired"));
  }
  return response;
}

function AuthScreen({ onAuthenticated }) {
  const [view, setView] = useState("login");
  const [form, setForm] = useState({
    account: "",
    username: "",
    displayName: "",
    email: "",
    password: "",
    code: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const endpoint =
        view === "register"
          ? "register"
          : view === "forgot"
            ? "forgot-password"
            : view === "reset"
              ? "reset-password"
              : "login";
      const response = await fetch(`/api/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok)
        throw new Error(payload.message || "操作失败");
      if (payload.user) return onAuthenticated(payload.user);
      if (view === "forgot") {
        if (payload.resetAvailable === false) {
          setMessage(payload.message);
          return;
        }
        setMessage(
          payload.developmentCode
            ? `本地重置码：${payload.developmentCode}（15 分钟内有效）`
            : payload.message,
        );
        setView("reset");
      } else if (view === "reset") {
        setMessage(payload.message);
        setView("login");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  const title =
    view === "register"
      ? "注册申报账号"
      : view === "forgot"
        ? "找回密码"
        : view === "reset"
          ? "设置新密码"
          : "账号登录";
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-brand">
          <span className="brand-mark">
            <span>节</span>
          </span>
          <span>
            <b>中国节能协会创新奖</b>
            <small>申报与评审系统</small>
          </span>
        </div>
        <div className="auth-title">
          <LockKeyhole size={22} />
          <span>
            <h1>{title}</h1>
            <p>登录后管理本人创建的申报项目与附件</p>
          </span>
        </div>
        <form onSubmit={submit}>
          {view === "register" && (
            <>
              <label>
                账号
                <input
                  className="control"
                  autoComplete="username"
                  value={form.username}
                  onChange={(e) => update("username", e.target.value)}
                  placeholder="3-32 位中文、字母或数字"
                />
              </label>
              <label>
                联系人或单位名称
                <input
                  className="control"
                  value={form.displayName}
                  onChange={(e) => update("displayName", e.target.value)}
                />
              </label>
              <label>
                邮箱
                <input
                  className="control"
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                />
              </label>
            </>
          )}
          {view !== "register" && (
            <label>
              账号或邮箱
              <input
                className="control"
                autoComplete="username"
                value={form.account}
                onChange={(e) => update("account", e.target.value)}
              />
            </label>
          )}
          {view === "reset" && (
            <label>
              六位重置码
              <input
                className="control"
                inputMode="numeric"
                value={form.code}
                onChange={(e) => update("code", e.target.value)}
              />
            </label>
          )}
          {view !== "forgot" && (
            <label>
              {view === "reset" ? "新密码" : "密码"}
              <input
                className="control"
                type="password"
                autoComplete={
                  view === "login" ? "current-password" : "new-password"
                }
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder="至少 8 位"
              />
            </label>
          )}
          {error && <div className="auth-message error">{error}</div>}
          {message && <div className="auth-message">{message}</div>}
          <button className="primary-button auth-submit" disabled={loading}>
            {loading ? (
              <LoaderCircle className="spin" size={17} />
            ) : view === "register" ? (
              <UserPlus size={17} />
            ) : (
              <LockKeyhole size={17} />
            )}
            {loading ? "处理中" : title}
          </button>
        </form>
        <div className="auth-links">
          {view !== "login" && (
            <button onClick={() => setView("login")}>返回登录</button>
          )}
          {view === "login" && (
            <>
              <button onClick={() => setView("register")}>注册账号</button>
              <button onClick={() => setView("forgot")}>忘记密码</button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function Field({ label, required, hint, children, wide = false }) {
  return (
    <div className={`field-row ${wide ? "field-row--wide" : ""}`}>
      <div className="field-label">
        {required && <span className="required">*</span>}
        {label}
      </div>
      <div className="field-control">
        {children}
        {hint && <p className="field-hint">{hint}</p>}
      </div>
    </div>
  );
}

function DirectoryRow({ label, children }) {
  return (
    <div className="ip-directory-row">
      <div className="ip-directory-label">{label}</div>
      <div className="ip-directory-content">{children}</div>
    </div>
  );
}

function TextInput({ value, onChange, placeholder, maxLength, type = "text" }) {
  return (
    <input
      className="control"
      type={type}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function disciplineDisplay(item, disciplineRecords = []) {
  if (!item) return "";
  if (typeof item === "string") return item;
  const byCode = new Map(
    disciplineRecords.map((record) => [record.code, record]),
  );
  const path = (Array.isArray(item.path) ? item.path : [])
    .map((code) => byCode.get(code))
    .filter(Boolean);
  if (path.length) {
    return path.map((record) => `${record.name}（${record.code}）`).join(" / ");
  }
  if (item.name && item.code) return `${item.name}（${item.code}）`;
  return item.name || item.code || "";
}

function newPerson(name, index) {
  return { ...createDefaultPerson(index), name };
}

function newUnit(name, index) {
  return { ...createDefaultUnit(index), name };
}

function TagEditor({
  values,
  onChange,
  placeholder,
  label,
  getLabel = (value) => value,
  createValue = (value) => value,
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const next = draft.trim();
    if (!next || values.some((value) => getLabel(value) === next)) return;
    onChange([...values, createValue(next, values.length)]);
    setDraft("");
  };
  return (
    <div className="tag-editor">
      <div className="tag-list" aria-label={`${label}排序列表`}>
        {values.map((value, index) => (
          <div
            className="entry-tag"
            key={value?.id || `${getLabel(value)}-${index}`}
          >
            <b>{index + 1}</b>
            <span className="entry-tag__name">{getLabel(value)}</span>
            <button
              type="button"
              disabled={index === 0}
              onClick={() =>
                onChange(reorderAndRenumber(values, index, index - 1))
              }
              aria-label={`上移${getLabel(value)}`}
              title="上移"
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              disabled={index === values.length - 1}
              onClick={() =>
                onChange(reorderAndRenumber(values, index, index + 1))
              }
              aria-label={`下移${getLabel(value)}`}
              title="下移"
            >
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              onClick={() =>
                onChange(renumberItems(values.filter((_, i) => i !== index)))
              }
              aria-label={`删除${getLabel(value)}`}
              title="删除"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="tag-add-row">
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          className="icon-button icon-button--small"
          onClick={add}
          title="添加"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

function AwardTypeLock({ profile }) {
  return (
    <div className="award-type-lock" role="status">
      <LockKeyhole size={16} />
      <span>
        <b>{profile.value}</b>
        <small>奖项在创建后锁定；如需申报其他奖项，请新建一份申报材料。</small>
      </span>
      <i>{profile.mode === "individual" ? "个人奖" : "项目奖"}</i>
    </div>
  );
}

function AchievementBasicForm({ data, setField, applicationId }) {
  const profile = getAwardProfile(data.awardType);
  const candidate = data.candidate || {};
  const setCandidate = (key, value) =>
    setField("candidate", { ...candidate, [key]: value });
  return (
    <section className="form-section">
      <div className="section-heading">
        <div>
          <span className="section-index">01</span>
          <h2>基本情况</h2>
        </div>
      </div>
      <div className="section-note">
        <Info size={16} />
        <span>
          科技成就奖面向个人申报。候选人应为主要发明成果第一完成人，且申报年末年龄不超过
          60 周岁。
        </span>
      </div>
      <div className="form-grid">
        <Field label="奖种" required>
          <AwardTypeLock profile={profile} />
        </Field>
        <Field label="申报年度" required>
          <select
            className="control"
            value={data.year}
            onChange={(event) => setField("year", event.target.value)}
          >
            <option>2026</option>
            <option>2025</option>
          </select>
        </Field>
        <Field label="候选人姓名（中文）" required>
          <TextInput
            value={data.projectName}
            onChange={(value) => setField("projectName", value)}
          />
        </Field>
        <Field label="候选人姓名（英文）">
          <TextInput
            value={data.projectNameEn}
            onChange={(value) => setField("projectNameEn", value)}
          />
        </Field>
        <Field label="性别">
          <TextInput
            value={candidate.gender}
            onChange={(value) => setCandidate("gender", value)}
          />
        </Field>
        <Field label="出生年月" required>
          <TextInput
            type="date"
            value={candidate.birthDate}
            onChange={(value) => setCandidate("birthDate", value)}
          />
        </Field>
        <Field label="民族">
          <TextInput
            value={candidate.ethnicity}
            onChange={(value) => setCandidate("ethnicity", value)}
          />
        </Field>
        <Field label="政治面貌">
          <TextInput
            value={candidate.politicalAffiliation}
            onChange={(value) => setCandidate("politicalAffiliation", value)}
          />
        </Field>
        <Field label="工作单位" required>
          <TextInput
            value={candidate.workUnit}
            onChange={(value) => setCandidate("workUnit", value)}
          />
        </Field>
        <Field label="行政职务">
          <TextInput
            value={candidate.administrativePosition}
            onChange={(value) => setCandidate("administrativePosition", value)}
          />
        </Field>
        <Field label="专业技术职称">
          <TextInput
            value={candidate.technicalTitle}
            onChange={(value) => setCandidate("technicalTitle", value)}
          />
        </Field>
        <Field label="学历">
          <TextInput
            value={candidate.education}
            onChange={(value) => setCandidate("education", value)}
          />
        </Field>
        <Field label="最高学位">
          <TextInput
            value={candidate.highestDegree}
            onChange={(value) => setCandidate("highestDegree", value)}
          />
        </Field>
        <Field label="毕业时间">
          <TextInput
            type="date"
            value={candidate.graduationDate}
            onChange={(value) => setCandidate("graduationDate", value)}
          />
        </Field>
        <Field label="推荐单位" required>
          <TextInput
            value={data.applicantUnit}
            onChange={(value) => setField("applicantUnit", value)}
          />
        </Field>
        <Field label="申报渠道" required>
          <select
            className="control"
            value={data.applicationChannel || "自由申报"}
            onChange={(event) =>
              setField("applicationChannel", event.target.value)
            }
          >
            {applicationChannels.map((channel) => (
              <option key={channel}>{channel}</option>
            ))}
          </select>
        </Field>
        <Field label="单位地址及邮编">
          <TextInput
            value={candidate.mailingAddress}
            onChange={(value) => setCandidate("mailingAddress", value)}
          />
        </Field>
        <Field label="家庭住址及邮编">
          <TextInput
            value={candidate.homeAddress}
            onChange={(value) => setCandidate("homeAddress", value)}
          />
        </Field>
        <div className="field-row field-row--triple">
          <div className="field-label">联系信息</div>
          <div className="field-control triple-controls">
            <label>
              <span>单位电话</span>
              <TextInput
                value={candidate.officePhone}
                onChange={(value) => setCandidate("officePhone", value)}
              />
            </label>
            <label>
              <span>手机号码</span>
              <TextInput
                value={candidate.mobilePhone}
                onChange={(value) => setCandidate("mobilePhone", value)}
              />
            </label>
            <label>
              <span>电子邮箱</span>
              <TextInput
                type="email"
                value={candidate.email}
                onChange={(value) => setCandidate("email", value)}
              />
            </label>
          </div>
        </div>
        <Field label="住宅电话">
          <TextInput
            value={candidate.homePhone}
            onChange={(value) => setCandidate("homePhone", value)}
          />
        </Field>
        <Field label="社会职务">
          <textarea
            className="control"
            value={candidate.socialPositions || ""}
            onChange={(event) =>
              setCandidate("socialPositions", event.target.value)
            }
          />
        </Field>
        <Field label="国内外学术组织任职情况">
          <textarea
            className="control"
            value={candidate.academicPositions || ""}
            onChange={(event) =>
              setCandidate("academicPositions", event.target.value)
            }
          />
        </Field>
        <Field
          label="节能减排相关工作总结"
          required
          hint="限 1000 字，阐述本人在该领域的工作经历、核心贡献、行业影响力等。"
        >
          <div className="control-with-count">
            <RichTextEditor
              value={data.workSummary || ""}
              onChange={(value) => setField("workSummary", value)}
              fieldKey="workSummary"
              label="节能减排相关工作总结"
              applicationId={applicationId}
            />
            <CharacterCount value={data.workSummary || ""} max={1000} />
          </div>
        </Field>
        <Field
          label="本人简历（从高校填起）"
          hint="按起止年月、单位（学校）、职务（专业）顺序填写。"
        >
          <RichTextEditor
            value={data.resume || ""}
            onChange={(value) => setField("resume", value)}
            fieldKey="resume"
            label="本人简历"
            applicationId={applicationId}
          />
        </Field>
      </div>
    </section>
  );
}

function BasicForm({ data, setField, disciplineRecords, applicationId }) {
  const isAchievement = data.awardType === AWARD_TYPES.ACHIEVEMENT;
  if (isAchievement)
    return (
      <AchievementBasicForm
        data={data}
        setField={setField}
        applicationId={applicationId}
      />
    );
  const profile = getAwardProfile(data.awardType);
  const toggleSource = (key) =>
    setField(
      "sources",
      data.sources.includes(key)
        ? data.sources.filter((item) => item !== key)
        : [...data.sources, key],
    );
  return (
    <section className="form-section">
      <div className="section-heading">
        <div>
          <span className="section-index">01</span>
          <h2>项目基本情况</h2>
        </div>
        <span className="section-status">
          <Check size={14} /> 已填写 13 项
        </span>
      </div>
      <div className="section-note">
        <Info size={16} />
        <span>
          字段依据《中国节能协会创新奖申报书》及 2026 年填写说明设置。带{" "}
          <b>*</b> 的项目为必填项。
        </span>
      </div>
      <div className="form-grid">
        <Field label="申报年度" required>
          <select
            className="control"
            value={data.year}
            onChange={(e) => setField("year", e.target.value)}
          >
            <option>2026</option>
            <option>2025</option>
          </select>
        </Field>
        <Field label="奖种" required>
          <AwardTypeLock profile={profile} />
        </Field>
        <Field
          label="项目名称（中文）"
          required
          hint={"应准确、简明反映核心技术创新内容，不超过 30 个汉字。"}
        >
          <div className="control-with-count">
            <TextInput
              value={data.projectName}
              maxLength={60}
              onChange={(value) => setField("projectName", value)}
            />
            <CharacterCount value={data.projectName} max={30} />
          </div>
        </Field>
        <Field
          label="项目名称（英文）"
          required
          hint="中文名称的规范英译文，不超过 200 个字符。"
        >
          <div className="control-with-count">
            <textarea
              className="control textarea--compact"
              value={data.projectNameEn}
              onChange={(e) => setField("projectNameEn", e.target.value)}
            />
            <CharacterCount value={data.projectNameEn} max={200} />
          </div>
        </Field>
        <Field
          label="主要完成人"
          required
          hint={`按贡献大小排序。本奖项单项授奖人数最多不超过 ${profile.maxPeople} 人，具体以拟申报等级要求为准。`}
        >
          <TagEditor
            values={data.people}
            onChange={(value) => setField("people", value)}
            label="主要完成人"
            placeholder="输入姓名后按回车"
            getLabel={(person) =>
              typeof person === "string" ? person : person?.name || "未填写姓名"
            }
            createValue={(name, index) => newPerson(name, index)}
          />
        </Field>
        <Field
          label="主要完成单位"
          required
          hint="单位须具有法人资格，按贡献大小排序。"
        >
          <TagEditor
            values={data.units}
            onChange={(value) => setField("units", value)}
            label="主要完成单位"
            placeholder="输入单位全称后按回车"
            getLabel={(unit) =>
              typeof unit === "string" ? unit : unit?.name || "未填写单位名称"
            }
            createValue={(name, index) => newUnit(name, index)}
          />
        </Field>
        <Field label="第一申报单位" required>
          <TextInput
            value={data.applicantUnit}
            onChange={(value) => setField("applicantUnit", value)}
          />
        </Field>
        <Field label="申报渠道" required>
          <select
            className="control"
            value={data.applicationChannel || "自由申报"}
            onChange={(e) => setField("applicationChannel", e.target.value)}
          >
            {applicationChannels.map((channel) => (
              <option key={channel}>{channel}</option>
            ))}
          </select>
        </Field>
        <div className="field-row field-row--triple">
          <div className="field-label">联系信息</div>
          <div className="field-control triple-controls">
            <label>
              <span>联系人</span>
              <TextInput
                value={data.contact}
                onChange={(value) => setField("contact", value)}
              />
            </label>
            <label>
              <span>联系电话</span>
              <TextInput
                value={data.phone}
                onChange={(value) => setField("phone", value)}
              />
            </label>
            <label>
              <span>邮箱</span>
              <TextInput
                value={data.email}
                onChange={(value) => setField("email", value)}
                type="email"
              />
            </label>
          </div>
        </div>
        <Field
          label="学科分类名称"
          required
          hint="最多选择3项，并按主要技术创新点涉及学科的先后顺序排列。"
        >
          <DisciplineSelector
            value={data.disciplines}
            onChange={(value) => setField("disciplines", value)}
            disciplines={disciplineRecords}
            label="检索学科"
            hierarchical={false}
          />
        </Field>
        <Field label="所属国民经济行业" required>
          <select
            className="control"
            value={data.industry}
            onChange={(e) => setField("industry", e.target.value)}
          >
            {industryOptions.slice(0, 16).map(([key, label]) => (
              <option key={key} value={key}>
                {key} · {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="项目来源" required>
          <div className="check-grid">
            {sourceOptions.map(([key, name, detail]) => (
              <label
                className={
                  data.sources.includes(key)
                    ? "check-item checked"
                    : "check-item"
                }
                key={key}
              >
                <input
                  type="checkbox"
                  checked={data.sources.includes(key)}
                  onChange={() => toggleSource(key)}
                />
                <span className="custom-check">
                  {data.sources.includes(key) && <Check size={13} />}
                </span>
                <span>
                  <b>
                    {key}. {name}
                  </b>
                  <small>{detail}</small>
                </span>
              </label>
            ))}
          </div>
        </Field>
        <Field label="具体计划、基金的名称和编号">
          <textarea
            className="control textarea--large"
            value={data.plans}
            onChange={(e) => setField("plans", e.target.value)}
            placeholder="每行填写一项，例如：（1）项目或基金名称（计划编号：2021YFB1234567）"
          />
        </Field>
        <Field label="项目起止时间" required>
          <div className="date-range">
            <label>
              <span>起始</span>
              <TextInput
                type="date"
                value={data.startDate}
                onChange={(value) => setField("startDate", value)}
              />
            </label>
            <ChevronRight size={18} />
            <label>
              <span>完成</span>
              <TextInput
                type="date"
                value={data.endDate}
                onChange={(value) => setField("endDate", value)}
              />
            </label>
          </div>
        </Field>
      </div>
    </section>
  );
}

function LongTextSection({
  number,
  title,
  description,
  fields,
  data,
  setField,
  applicationId,
  prefixes = {},
  supplements = {},
}) {
  return (
    <section className="form-section">
      <div className="section-heading">
        <div>
          <span className="section-index">
            {String(number).padStart(2, "0")}
          </span>
          <h2>{title}</h2>
        </div>
      </div>
      {description && (
        <div className="section-note">
          <Info size={16} />
          <span>{description}</span>
        </div>
      )}
      <div className="form-grid">
        {fields.map((field) => (
          <React.Fragment key={field.key}>
            {prefixes[field.key]}
            <Field
              label={field.label}
              required={field.required}
              hint={field.hint}
            >
              <div className="control-with-count">
                <RichTextEditor
                  value={data[field.key] || ""}
                  onChange={(value) => setField(field.key, value)}
                  applicationId={applicationId}
                  fieldKey={field.key}
                  label={field.label}
                />
                {field.max && (
                  <CharacterCount value={data[field.key]} max={field.max} />
                )}
              </div>
            </Field>
            {supplements[field.key]}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

function RecordsSection({
  number,
  title,
  type,
  group: customGroup,
  records,
  onChange,
  supplement,
  addLabel = "添加记录",
  emptyLabel,
  fields,
  showIndex = false,
  directoryLabel,
  tableTitle,
}) {
  const group = customGroup || (type === "ip" ? "ipRecords" : "awardRecords");
  const table = (
    <StructuredTable
      group={group}
      fields={fields}
      title={tableTitle}
      value={records}
      onChange={onChange}
      addLabel={addLabel}
      emptyLabel={
        emptyLabel ||
        (type === "ip"
          ? "暂无知识产权记录，可手动添加"
          : "暂无记录，无相关内容时可保持为空")
      }
      className="records-collection"
      confirmRemoval={group === "ipRecords"}
      showIndex={showIndex}
    />
  );
  return (
    <section className="form-section">
      <div className="section-heading">
        <div>
          <span className="section-index">
            {String(number).padStart(2, "0")}
          </span>
          <h2>{title}</h2>
        </div>
      </div>
      {directoryLabel ? (
        <div className="ip-directory-grid">
          <DirectoryRow label={directoryLabel}>{table}</DirectoryRow>
          {supplement}
        </div>
      ) : (
        <>
          {table}
          {supplement}
        </>
      )}
    </section>
  );
}

const achievementRecordFields = Object.freeze({
  honors: [
    { key: "name", label: "奖励或荣誉名称", required: true, minWidth: 210 },
    { key: "org", label: "授奖单位", minWidth: 180 },
    { key: "date", label: "授奖日期", type: "date", minWidth: 140 },
    { key: "totalPeople", label: "获奖总人数", minWidth: 110 },
    { key: "personalRank", label: "本人排名", minWidth: 100 },
  ],
  publications: [
    {
      key: "title",
      label:
        "基本信息（名称 + 年份 + 本人排名 + 主要合作者 + 发表刊物 / 出版社）",
      required: true,
      multiline: true,
      minWidth: 360,
    },
    {
      key: "contribution",
      label: "本人作用和主要贡献（限 100 字 / 项）",
      multiline: true,
      maxLength: 100,
      minWidth: 320,
    },
  ],
  achievementIp: [
    { key: "type", label: "知识产权类别", minWidth: 140 },
    { key: "name", label: "授权项目名称", required: true, minWidth: 220 },
    { key: "country", label: "国（区）别", minWidth: 110 },
    { key: "authorizationNumber", label: "授权号", minWidth: 150 },
    { key: "authorizationDate", label: "授权日期", minWidth: 130 },
    { key: "certificateNumber", label: "证书编号", minWidth: 140 },
    { key: "owner", label: "权利人", minWidth: 150 },
    { key: "inventorRank", label: "发明人排名", minWidth: 110 },
    { key: "correspondingAchievement", label: "对应标志性成果", minWidth: 180 },
    { key: "evidenceNumber", label: "证明材料编号", minWidth: 140 },
  ],
  research: [
    { key: "name", label: "项目名称", required: true, minWidth: 210 },
    { key: "funding", label: "研发经费（万元）", minWidth: 130 },
    { key: "source", label: "项目来源", minWidth: 150 },
    { key: "projectNumber", label: "项目编号", minWidth: 140 },
    { key: "period", label: "研发起止时间", minWidth: 160 },
    { key: "status", label: "状态（在研 / 已验收）", minWidth: 150 },
    { key: "leader", label: "负责人", minWidth: 120 },
    { key: "personalRank", label: "本人在项目成果中排序", minWidth: 150 },
    { key: "evidenceNumber", label: "证明材料编号", minWidth: 140 },
  ],
  engineering: [
    { key: "name", label: "项目名称", required: true, minWidth: 230 },
    { key: "client", label: "项目委托单位", minWidth: 210 },
    {
      key: "participation",
      label: "本人参与情况（核心职责 / 贡献）",
      multiline: true,
      minWidth: 280,
    },
    {
      key: "economicBenefit",
      label: "项目产生的经济效益（万元）",
      minWidth: 180,
    },
  ],
});

function PapersTable({ records, onChange }) {
  return (
    <StructuredTable
      group="paperRecords"
      title="论著"
      value={records}
      onChange={onChange}
      addLabel="添加论著"
      emptyLabel="暂无论著记录"
      className="paper-collection"
      showIndex
    />
  );
}

function ApplicationUnitsTable({ records, onChange }) {
  return (
    <StructuredTable
      group="applicationUnits"
      fields={[
        {
          key: "unitName",
          label: "应用单位名称",
          required: true,
          minWidth: 220,
        },
        {
          key: "startDate",
          label: "应用起始时间（年 / 月）",
          type: "month",
          minWidth: 170,
        },
        { key: "contactPhone", label: "联系人及电话", minWidth: 210 },
        {
          key: "economicBenefit",
          label: "使用本项目产生的经济效益（万元）",
          minWidth: 210,
        },
      ]}
      title="主要应用单位情况"
      value={records}
      onChange={onChange}
      addLabel="添加应用单位"
      emptyLabel="暂无应用单位记录"
      className="application-unit-collection"
    />
  );
}

const technicalEvaluationFields = [
  { key: "fileName", label: "文件名称", required: true, minWidth: 220 },
  { key: "issuer", label: "出具单位", minWidth: 190 },
  { key: "issuedAt", label: "出具时间", minWidth: 150 },
  { key: "fileNumber", label: "文件编号", minWidth: 180 },
];

function technicalEvaluationRows(value) {
  if (!value) return [];
  const container = document.createElement("div");
  container.innerHTML = sanitizeRichText(value);
  const tableRows = Array.from(container.querySelectorAll("tr")).map((row) =>
    Array.from(row.querySelectorAll("th, td")).map((cell) =>
      cell.textContent.trim(),
    ),
  );
  const headerIndex = tableRows.findIndex((row) => row.includes("文件名称"));
  if (headerIndex >= 0) {
    return tableRows
      .slice(headerIndex + 1)
      .map(([fileName = "", issuer = "", issuedAt = "", fileNumber = ""]) => ({
        fileName,
        issuer,
        issuedAt,
        fileNumber,
      }))
      .filter((record) => Object.values(record).some(Boolean));
  }
  const text = richTextToPlain(value).trim();
  return text ? [{ fileName: text, issuer: "", issuedAt: "", fileNumber: "" }] : [];
}

function escapeTableValue(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function serializeTechnicalEvaluation(records) {
  if (!records.length) return "";
  const rows = [
    technicalEvaluationFields.map((field) => field.label),
    ...records.map((record) =>
      technicalEvaluationFields.map((field) => record[field.key] || ""),
    ),
  ];
  return `<table><tbody>${rows
    .map(
      (row) =>
        `<tr>${row.map((value) => `<td>${escapeTableValue(value)}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody></table>`;
}

function TechnicalEvaluationTable({ value, onChange }) {
  return (
    <StructuredTable
      fields={technicalEvaluationFields}
      title="技术评价证明及行业审批文件"
      value={technicalEvaluationRows(value)}
      onChange={(records) => onChange(serializeTechnicalEvaluation(records))}
      addLabel="添加文件"
      emptyLabel="暂无技术评价证明或行业审批文件"
      className="technical-evaluation-collection"
    />
  );
}

function EconomicCollection({
  summary,
  records,
  onSummaryChange,
  onRecordsChange,
}) {
  const normalized = summary || { totalInvestment: "", paybackYears: "" };
  return (
    <div className="economic-collection">
      <div className="economic-summary-head">
        <b>经济效益数据</b>
        <small>选填；除创收外汇为万美元外，其余金额单位为万元人民币</small>
      </div>
      <div className="economic-summary-fields">
        {getPdfFields("economicSummary").map((field) => (
          <label key={field.key}>
            <span>
              {field.label}
              {field.unit && !field.label.includes(field.unit)
                ? `（${field.unit}）`
                : ""}
            </span>
            <input
              className="control"
              type={field.type}
              inputMode={field.inputMode}
              value={normalized[field.key] || ""}
              onChange={(event) =>
                onSummaryChange({
                  ...normalized,
                  [field.key]: event.target.value,
                })
              }
            />
          </label>
        ))}
      </div>
      <StructuredTable
        group="economicRecords"
        fields={[
          { key: "year", label: "年份", minWidth: 100 },
          { key: "newProfit", label: "新增利润", minWidth: 140 },
          { key: "newTax", label: "新增税收", minWidth: 140 },
          {
            key: "foreignExchange",
            label: "创收外汇（美元）",
            minWidth: 160,
          },
          { key: "savingsTotal", label: "节支总额", minWidth: 140 },
        ]}
        title="近三年新增直接效益"
        value={records}
        onChange={onRecordsChange}
        addLabel="添加年度"
        emptyLabel="暂无年度经济效益数据"
        className="economic-record-collection"
      />
    </div>
  );
}

function RecommendationUploadSection({
  applicationId,
  awardType,
  onFilesChange,
}) {
  const profile = getAwardProfile(awardType);
  const isAchievement = profile.code === "achievement";
  const categories = profile.recommendationMaterials;
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState("");
  const loadFiles = async () => {
    const response = await apiFetch(`/api/applications/${applicationId}/files`);
    const payload = await response.json();
    if (payload.ok) {
      onFilesChange?.(payload.list || []);
      setFiles(
        (payload.list || []).filter((file) =>
          categories.some(([category]) => category === file.file_type),
        ),
      );
    }
  };
  useEffect(() => {
    loadFiles();
  }, [applicationId]);
  const uploadFile = async (category, file) => {
    if (!file) return;
    setUploading(category);
    const body = new FormData();
    body.append("file", file);
    body.append("category", category);
    try {
      const response = await apiFetch(
        `/api/applications/${applicationId}/files`,
        { method: "POST", body },
      );
      const payload = await response.json();
      if (!response.ok || !payload.ok)
        throw new Error(payload.message || "上传失败");
      await loadFiles();
    } catch (error) {
      window.alert(error.message);
    } finally {
      setUploading("");
    }
  };
  const removeFile = async (file) => {
    const response = await apiFetch(
      `/api/applications/${applicationId}/files/${file.id}`,
      { method: "DELETE" },
    );
    if (response.ok) loadFiles();
  };
  return (
    <section className="form-section">
      <div className="section-heading">
        <div>
          <span className="section-index">{isAchievement ? "08" : "10"}</span>
          <h2>{isAchievement ? "推荐函与承诺函" : "申报、推荐单位意见"}</h2>
        </div>
      </div>
      {categories.map(([category, label, description]) => {
        const categoryFiles = files.filter(
          (file) => file.file_type === category,
        );
        return (
          <div className="recommendation-upload" key={category}>
            <div className="recommendation-upload-main">
              <span className="recommendation-upload-icon">
                <FileCheck2 size={25} />
              </span>
              <span>
                <b>{label}</b>
                <small>{description}</small>
              </span>
              <span
                className={
                  categoryFiles.length
                    ? "attachment-state done"
                    : "attachment-state"
                }
              >
                {categoryFiles.length
                  ? `已上传 ${categoryFiles.length} 件`
                  : "未上传"}
              </span>
              <label className="primary-button recommendation-upload-button">
                {uploading === category ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Upload size={16} />
                )}
                {uploading === category ? "上传中" : "上传附件"}
                <input
                  hidden
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  disabled={Boolean(uploading)}
                  onChange={(event) =>
                    uploadFile(category, event.target.files?.[0])
                  }
                />
              </label>
            </div>
            {categoryFiles.map((file) => (
              <div className="uploaded-file recommendation-file" key={file.id}>
                <FileText size={15} />
                <span>{file.file_name}</span>
                <small>
                  {file.page_count || 1} 页 ·{" "}
                  {(file.file_size / 1024 / 1024).toFixed(2)} MB
                </small>
                <a
                  className="icon-button icon-button--small"
                  title="查看附件"
                  target="_blank"
                  href={`/api/applications/${applicationId}/files/${file.id}/download?inline=1`}
                >
                  <Eye size={14} />
                </a>
                <button
                  className="icon-button icon-button--small"
                  type="button"
                  title="删除附件"
                  onClick={() => removeFile(file)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}

function AttachmentSection({
  applicationId,
  workflowMode,
  awardType,
  onFilesChange,
}) {
  const profile = getAwardProfile(awardType);
  const isAchievement = profile.code === "achievement";
  const items = profile.attachmentMaterials;
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState("");
  const loadFiles = async () => {
    const response = await apiFetch(`/api/applications/${applicationId}/files`);
    const payload = await response.json();
    if (payload.ok) {
      setFiles(payload.list || []);
      onFilesChange?.(payload.list || []);
    }
  };
  useEffect(() => {
    loadFiles();
  }, [applicationId]);
  const uploadMaterial = async (category, file) => {
    if (!file) return;
    setUploading(category);
    const body = new FormData();
    body.append("file", file);
    body.append("category", category);
    try {
      const response = await apiFetch(
        `/api/applications/${applicationId}/files`,
        {
          method: "POST",
          body,
        },
      );
      const payload = await response.json();
      if (!response.ok || !payload.ok)
        throw new Error(payload.message || "上传失败");
      await loadFiles();
    } catch (error) {
      window.alert(error.message);
    } finally {
      setUploading("");
    }
  };
  const removeFile = async (file) => {
    await apiFetch(`/api/applications/${applicationId}/files/${file.id}`, {
      method: "DELETE",
    });
    loadFiles();
  };
  const attachmentFiles = files.filter(
    (file) =>
      file.file_type !== "source_pdf" &&
      !file.file_type.startsWith("content_image:") &&
      !file.file_type.startsWith("section_word:") &&
      !file.file_type.startsWith("section_signed:"),
  );
  const sourceFile = files.find((file) => file.file_type === "source_pdf");
  const totalPages = attachmentFiles.reduce(
    (sum, file) => sum + Number(file.page_count || 1),
    0,
  );
  return (
    <section className="form-section">
      <div className="section-heading">
        <div>
          <span className="section-index">{isAchievement ? "08" : "10"}</span>
          <h2>{isAchievement ? "证明材料" : "附件目录"}</h2>
        </div>
      </div>
      {!isAchievement && (
        <div className="form-guidance attachment-guidance">
          <Info size={16} />
          <span>
            依据《填写说明》，第 1 至 7 项为必备附件；第 8
            项按项目实际情况提交。
            请按每项标注的原件、复印件及盖章要求准备材料。
          </span>
        </div>
      )}
      {sourceFile && (
        <div className="final-document-bar">
          <FileCheck2 size={20} />
          <span>
            <b>最终签章合并版已保留</b>
            <small>
              {sourceFile.file_name} · {sourceFile.page_count || 1} 页
            </small>
          </span>
          <a
            className="secondary-button"
            target="_blank"
            href={`/api/applications/${applicationId}/files/${sourceFile.id}/download?inline=1`}
          >
            <Eye size={15} />
            查看
          </a>
          <a
            className="primary-button"
            href={`/api/applications/${applicationId}/files/${sourceFile.id}/download`}
          >
            <Download size={15} />
            导出最终版 PDF
          </a>
        </div>
      )}
      <div
        className={
          !isAchievement && totalPages > 40
            ? "attachment-summary over"
            : "attachment-summary"
        }
      >
        <Info size={17} />
        <span>
          <b>
            {isAchievement
              ? `证明附件共 ${attachmentFiles.length} 件，合计 ${totalPages} 页`
              : `附件共 ${attachmentFiles.length} 件，合计 ${totalPages} / 40 页`}
          </b>
          <small>
            支持 PDF、JPG、PNG，单个文件不超过 100 MB；多页图片请先合并为
            PDF，Office 文件请转换为 PDF。
          </small>
        </span>
        <strong>
          {isAchievement
            ? "按材料类型分别上传"
            : totalPages > 40
              ? `超出 ${totalPages - 40} 页`
              : `还可上传 ${40 - totalPages} 页`}
        </strong>
      </div>
      <div className="attachment-list">
        {items.map(([key, item, requirement], index) => {
          const groupFiles = attachmentFiles.filter(
            (file) => file.file_type === key,
          );
          const pages = groupFiles.reduce(
            (sum, file) => sum + Number(file.page_count || 1),
            0,
          );
          return (
            <div className="attachment-row-wrap" key={key}>
              <div className="attachment-row">
                <span className="attachment-number">{index + 1}</span>
                <FileCheck2 size={19} />
                <span>
                  <b>{item}</b>
                  <small>{requirement}</small>
                </span>
                <span
                  className={
                    groupFiles.length
                      ? "attachment-state done"
                      : "attachment-state"
                  }
                >
                  {groupFiles.length
                    ? `已上传 ${groupFiles.length} 件 / ${pages} 页`
                    : "未上传"}
                </span>
                <label className="secondary-button attachment-upload-button">
                  {uploading === key ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Upload size={15} />
                  )}
                  {uploading === key ? "上传中" : "上传"}
                  <input
                    hidden
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    disabled={Boolean(uploading)}
                    onChange={(event) =>
                      uploadMaterial(key, event.target.files?.[0])
                    }
                  />
                </label>
              </div>
              {groupFiles.map((file) => (
                <div className="uploaded-file" key={file.id}>
                  <FileText size={15} />
                  <span>{file.file_name}</span>
                  <small>
                    {file.page_count || 1} 页 ·{" "}
                    {(file.file_size / 1024 / 1024).toFixed(2)} MB
                  </small>
                  <a
                    className="icon-button icon-button--small"
                    title="查看附件"
                    target="_blank"
                    href={`/api/applications/${applicationId}/files/${file.id}/download?inline=1`}
                  >
                    <Eye size={14} />
                  </a>
                  <button
                    className="icon-button icon-button--small"
                    title="删除附件"
                    onClick={() => removeFile(file)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {!isAchievement && workflowMode === "document" && !sourceFile && (
        <div className="warning-row">
          <AlertCircle size={16} />
          当前为整本材料导入模式，请点击右上角“PDF 智能导入”上传最终签章合并版。
        </div>
      )}
    </section>
  );
}

const PROJECT_TEMPLATE_DETAILS = Object.freeze({
  unitRecommendation: [
    "申报单位意见：明确表述对项目真实性、创新性、应用价值的审核意见及推荐申报意愿，并加盖申报单位公章。",
    "推荐单位推荐意见：勾选一等奖、二等奖或三等奖，阐述推荐理由，并加盖推荐单位公章。",
    "专家推荐申报不填写本章。",
  ],
  expertRecommendation: [
    "由推荐专家独立填写，不得代填后签名。",
    "完整填写姓名、性别、出生年月、工作单位、通讯地址、邮政编码、联系电话、技术职称、专业专长、现从事工作及专家类别。",
    "推荐意见限 800 字，阐述主要技术内容、核心创新点、应用领域、经济和社会效益、技术水平，并明确建议奖励等级。",
  ],
  authenticity: [
    "确认申报书及全部附件材料真实、合法、有效，不存在弄虚作假、剽窃他人成果或隐瞒相关信息。",
    "由申报单位盖章并填写日期。",
  ],
  confidentiality: [
    "完整填写单位名称、统一社会信用代码、法定代表人、项目名称、奖项类别、联系人、电话、邮箱和承诺日期。",
    "对纸质版、电子版申报书及全部附件完成保密自查，确认不含国家秘密、工作秘密及敏感信息。",
    "法定代表人亲笔签字并加盖单位公章。",
  ],
  integrity: [
    "确认全部材料、数据、图片和证明文件真实、准确、完整、有效。",
    "确认成果权属清晰且不侵犯任何第三方合法权益。",
    "确认申报程序公平合规，近三年无重大事故、严重失信、行政处罚及学术不端行为。",
    "承诺单位盖章、项目负责人签字，并填写统一社会信用代码、联系方式和日期。",
  ],
});

const ACHIEVEMENT_TEMPLATE_DETAILS = Object.freeze({
  authenticity: [
    "确认本次提交的申报书及证明、报表、报告等资料真实、合法、有效且均为最新资料。",
    "由申报单位盖章并填写日期。",
  ],
  integrity: PROJECT_TEMPLATE_DETAILS.integrity,
});

function TemplateOnlySection({ section, profile }) {
  const details =
    (profile.code === "achievement"
      ? ACHIEVEMENT_TEMPLATE_DETAILS
      : PROJECT_TEMPLATE_DETAILS)[section.key] || [];
  return (
    <section className="form-section template-only-section">
      <div className="section-heading">
        <div>
          <span className="section-index">
            {String(section.number).padStart(2, "0")}
          </span>
          <h2>{section.label}</h2>
        </div>
      </div>
      <div className="section-note">
        <Info size={16} />
        <span>{section.requirement}</span>
      </div>
      <div className="template-requirements">
        <h3>模板填写要求</h3>
        <ol>
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ol>
        {section.uploadMode === "signed" ? (
          <p>
            请下载本章原始模板填写；完成签字、盖章后，通过上方按钮上传 PDF
            或清晰扫描图片留存。
          </p>
        ) : (
          <p>
            请下载本章原始模板填写；完成后通过上方“上传本章 Word”留存并识别。
          </p>
        )}
      </div>
    </section>
  );
}

function SectionTemplateBar({
  applicationId,
  section,
  uploadedFile,
  onUpload,
}) {
  const signedUploadRef = useRef(null);
  const isSignedUpload = section.uploadMode === "signed";
  return (
    <section
      className="section-template-bar"
      aria-label={isSignedUpload ? "本章签章文件" : "本章 Word 模板"}
    >
      <div className="section-template-copy">
        <span className="section-template-icon">
          <FileText size={20} />
        </span>
        <span>
          <b>{section.templateFile}</b>
          <small>{section.requirement}</small>
        </span>
      </div>
      {uploadedFile && (
        <a
          className="section-word-status"
          href={`/api/applications/${applicationId}/files/${uploadedFile.id}/download`}
          title={uploadedFile.file_name}
        >
          <Check size={14} />
          已上传 {uploadedFile.file_name}
        </a>
      )}
      <div className="section-template-actions">
        <a className="secondary-button" href={section.templateHref} download>
          <Download size={16} />
          下载本章模板
        </a>
        {isSignedUpload && (
          <input
            ref={signedUploadRef}
            hidden
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            onChange={(event) => {
              onUpload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        )}
        <button
          className="primary-button"
          type="button"
          onClick={() =>
            isSignedUpload ? signedUploadRef.current?.click() : onUpload()
          }
        >
          <Upload size={16} />
          {uploadedFile
            ? `重新上传${isSignedUpload ? "签章文件" : "本章 Word"}`
            : `上传${isSignedUpload ? "签章文件" : "本章 Word"}`}
        </button>
      </div>
    </section>
  );
}

function ImportDialog({ applicationId, onClose, onApply }) {
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [selectedFields, setSelectedFields] = useState([]);
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const inputRef = useRef(null);
  const uploadFile = async (file) => {
    if (!file) return;
    setStatus("loading");
    setError("");
    setUploadProgress(0);
    try {
      const createResponse = await apiFetch("/api/pdf-uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          size: file.size,
          applicationId,
        }),
      });
      const upload = await createResponse.json();
      if (!createResponse.ok || !upload.ok)
        throw new Error(upload.message || "无法创建上传任务");
      for (let index = 0; index < upload.totalChunks; index += 1) {
        const start = index * upload.chunkSize;
        let chunkError;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            const chunkResponse = await apiFetch(
              `/api/pdf-uploads/${upload.uploadId}/chunks/${index}`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/octet-stream" },
                body: file.slice(
                  start,
                  Math.min(start + upload.chunkSize, file.size),
                ),
              },
            );
            const chunk = await chunkResponse.json();
            if (!chunkResponse.ok || !chunk.ok)
              throw new Error(chunk.message || "服务器拒绝了该分片");
            chunkError = null;
            break;
          } catch (error) {
            chunkError = error;
            if (attempt < 3)
              await new Promise((resolve) =>
                setTimeout(resolve, 750 * attempt),
              );
          }
        }
        if (chunkError)
          throw new Error(
            `第 ${index + 1} 个分片上传失败：${chunkError.message}`,
          );
        setUploadProgress(Math.round(((index + 1) / upload.totalChunks) * 100));
      }
      const completeResponse = await apiFetch(
        `/api/pdf-uploads/${upload.uploadId}/complete`,
        { method: "POST" },
      );
      let payload = await completeResponse.json();
      if (!completeResponse.ok || !payload.ok)
        throw new Error(payload.message || "无法启动识别任务");
      if (payload.jobId) {
        const deadline = Date.now() + 45 * 60_000;
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 1_500));
          const statusResponse = await apiFetch(
            `/api/extract-pdf/${payload.jobId}`,
          );
          const job = await statusResponse.json();
          if (!statusResponse.ok || !job.ok)
            throw new Error(job.message || "无法查询识别进度");
          if (job.status === "failed")
            throw new Error(job.message || "识别失败");
          if (job.status === "completed") {
            payload = job.result;
            break;
          }
        }
        if (!payload.recognized) throw new Error("识别超时，请重试");
      }
      setResult(payload);
      setSelectedFields(payload.recognized.map((item) => item.key));
      setStatus("done");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  };
  return (
    <div className="modal-layer">
      <div className="dialog import-dialog">
        <div className="dialog-head">
          <div>
            <span className="dialog-icon">
              <Sparkles size={19} />
            </span>
            <span>
              <b>PDF 智能导入</b>
              <small>自动提取可复制文本并映射到申报字段</small>
            </span>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="关闭"
            disabled={status === "loading"}
          >
            <X size={20} />
          </button>
        </div>
        <div className="dialog-body">
          {status === "idle" && (
            <button
              className="drop-zone"
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              <ScanText size={36} />
              <b>选择一份已填写申报书</b>
              <span>
                支持 PDF，最大 100 MB；识别后原始文件将作为最终签章版保留
              </span>
            </button>
          )}
          <input
            ref={inputRef}
            hidden
            type="file"
            accept="application/pdf"
            onChange={(e) => uploadFile(e.target.files?.[0])}
          />
          {status === "loading" && (
            <div className="analysis-loading">
              <LoaderCircle className="spin" size={34} />
              <b>
                {uploadProgress < 100
                  ? `正在上传申报书 ${uploadProgress}%`
                  : "正在识别申报书结构"}
              </b>
              <span>
                {uploadProgress < 100
                  ? "文件已分片上传，网络波动时只需重试当前分片。"
                  : "分析正文及附件目录，定位项目、人员、单位与核心章节…"}
              </span>
            </div>
          )}
          {status === "error" && (
            <div className="error-box">
              <AlertCircle size={20} />
              <span>
                <b>识别未完成</b>
                {error}
              </span>
              <button
                className="secondary-button"
                onClick={() => inputRef.current?.click()}
              >
                重新选择
              </button>
            </div>
          )}
          {status === "done" && result && (
            <>
              <div className="analysis-summary">
                <ShieldCheck size={22} />
                <span>
                  <b>识别完成</b>
                  <small>
                    {result.fileName} · 提取{" "}
                    {result.extractedCharacters.toLocaleString()} 个字符
                    {result.analyzedPages
                      ? ` · 已分析 ${result.analyzedPages}${result.totalPages ? ` / ${result.totalPages}` : ""} 页`
                      : ""}
                  </small>
                </span>
              </div>
              <div className="recognition-list">
                {result.recognized.map((item) => (
                  <label className="recognition-item" key={item.key}>
                    <span className="confidence">
                      {Math.round(item.confidence * 100)}%
                    </span>
                    <span>
                      <b>{item.field}</b>
                      <small>来源：{item.source}</small>
                      <p>{item.value}</p>
                    </span>
                    <input
                      type="checkbox"
                      checked={selectedFields.includes(item.key)}
                      onChange={() =>
                        setSelectedFields((current) =>
                          current.includes(item.key)
                            ? current.filter((key) => key !== item.key)
                            : [...current, item.key],
                        )
                      }
                      aria-label={`应用${item.field}`}
                    />
                  </label>
                ))}
              </div>
              {result.warnings.map((warning) => (
                <div className="warning-row" key={warning}>
                  <AlertCircle size={16} />
                  {warning}
                </div>
              ))}
            </>
          )}
        </div>
        <div className="dialog-actions">
          <button
            className="secondary-button"
            onClick={onClose}
            disabled={status === "loading"}
          >
            取消
          </button>
          <button
            className="primary-button"
            disabled={!result || selectedFields.length === 0}
            onClick={() =>
              onApply(
                Object.fromEntries(
                  Object.entries(result.fields).filter(([key]) =>
                    selectedFields.includes(key),
                  ),
                ),
                result,
              )
            }
          >
            <Check size={17} />
            应用已选字段{result ? `（${selectedFields.length}）` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewPageOne({ data, disciplineRecords }) {
  const formatDate = (value) =>
    value
      ? value
          .replace(/-(\d{2})-(\d{2})$/, " 年 $1 月 $2 日")
          .replace(/^(\d{4})/, "$1")
      : "年　　月　　日";
  return (
    <article className="preview-page preview-basic-page">
      <header>
        <h1>中国节能协会创新奖</h1>
        <h2>{data.awardType.replace("节能减排", "")}申报书</h2>
        <p>（{data.year} 年度）</p>
      </header>
      <h3>一、项目基本情况</h3>
      <p className="preview-award-kind">
        奖种： {data.awardType === AWARD_TYPES.PROGRESS ? "☑" : "□"}
        节能减排科技进步奖&nbsp;&nbsp;
        {data.awardType === AWARD_TYPES.INVENTION ? "☑" : "□"}
        节能减排技术发明奖
      </p>
      <table>
        <colgroup>
          <col style={{ width: "10.88%" }} />
          <col style={{ width: "10.88%" }} />
          <col style={{ width: "5.8%" }} />
          <col style={{ width: "31.03%" }} />
          <col style={{ width: "2.52%" }} />
          <col style={{ width: "12.63%" }} />
          <col style={{ width: "26%" }} />
        </colgroup>
        <tbody>
          <tr>
            <th rowSpan="2">
              项 目<br />名 称
            </th>
            <td className="subhead">中文</td>
            <td colSpan="5">{data.projectName}</td>
          </tr>
          <tr>
            <td className="subhead">英文</td>
            <td colSpan="5" className="preview-en">
              {data.projectNameEn}
            </td>
          </tr>
          <tr>
            <th colSpan="2">主要完成人</th>
            <td colSpan="5">
              {data.people
                .map((person) =>
                  typeof person === "string" ? person : person?.name,
                )
                .filter(Boolean)
                .join("、")}
            </td>
          </tr>
          <tr>
            <th colSpan="2">主要完成单位</th>
            <td colSpan="5">
              {data.units
                .map((unit) => (typeof unit === "string" ? unit : unit?.name))
                .filter(Boolean)
                .join("、")}
            </td>
          </tr>
          <tr>
            <th rowSpan="3" colSpan="2">
              第一申报单位
            </th>
            <td rowSpan="3" colSpan="3" className="stamp-cell">
              <span>{data.applicantUnit}</span>
              <i>盖章</i>
            </td>
            <td className="subhead">联系人</td>
            <td>{data.contact}</td>
          </tr>
          <tr>
            <td className="subhead">联系电话</td>
            <td>{data.phone}</td>
          </tr>
          <tr>
            <td className="subhead">邮箱</td>
            <td>{data.email}</td>
          </tr>
          <tr>
            <th rowSpan="3" colSpan="2">
              学 科 分 类<br />名 称
            </th>
            <td className="subhead">1</td>
            <td colSpan="4">
              {disciplineDisplay(
                derivePrimaryDiscipline(data.disciplines),
                disciplineRecords,
              )}
            </td>
          </tr>
          <tr>
            <td className="subhead">2</td>
            <td colSpan="4">
              {disciplineDisplay(data.disciplines?.[1], disciplineRecords)}
            </td>
          </tr>
          <tr>
            <td className="subhead">3</td>
            <td colSpan="4">
              {disciplineDisplay(data.disciplines?.[2], disciplineRecords)}
            </td>
          </tr>
          <tr>
            <th colSpan="2">所属行业</th>
            <td colSpan="5">
              <div className="industry-letters">
                {industryOptions.slice(0, 16).map(([key]) => (
                  <span
                    className={data.industry === key ? "selected-letter" : ""}
                    key={key}
                  >
                    {key}
                  </span>
                ))}
              </div>
            </td>
          </tr>
          <tr>
            <th colSpan="2">项目来源</th>
            <td colSpan="5">
              <div className="source-lines">
                {sourceOptions.map(([key, label]) => (
                  <span key={key}>
                    {data.sources.includes(key) ? "☑" : "□"} {key}.{label}
                  </span>
                ))}
              </div>
            </td>
          </tr>
          <tr>
            <th colSpan="2">
              具体计划、基金
              <br />
              名称和编号
            </th>
            <td colSpan="5" className="plans-cell">
              {data.plans}
            </td>
          </tr>
          <tr>
            <th colSpan="2">项目起止时间</th>
            <td colSpan="3">
              <div className="preview-date-range-value">
                <span>起始：</span>
                <span>{formatDate(data.startDate)}</span>
              </div>
            </td>
            <td colSpan="2">
              <div className="preview-date-range-value">
                <span>完成：</span>
                <span>{formatDate(data.endDate)}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <footer>1</footer>
    </article>
  );
}

function PreviewAchievementPageOne({ data }) {
  const candidate = data.candidate || {};
  return (
    <article className="preview-page preview-basic-page preview-achievement-basic">
      <header>
        <h1>中国节能协会创新奖</h1>
        <h2>科技成就奖申报书</h2>
        <p>（{data.year} 年度）</p>
      </header>
      <h3>一、候选人基本情况</h3>
      <table aria-label="候选人基本情况">
        <tbody>
          <tr>
            <th>姓 名</th>
            <td>{data.projectName}</td>
            <th>英文姓名</th>
            <td>{data.projectNameEn}</td>
          </tr>
          <tr>
            <th>性 别</th>
            <td>{candidate.gender}</td>
            <th>出生年月</th>
            <td>{candidate.birthDate}</td>
          </tr>
          <tr>
            <th>出生地</th>
            <td>{candidate.birthPlace}</td>
            <th>籍 贯</th>
            <td>{candidate.nativePlace}</td>
          </tr>
          <tr>
            <th>民 族</th>
            <td>{candidate.ethnicity}</td>
            <th>国 籍</th>
            <td>{candidate.nationality}</td>
          </tr>
          <tr>
            <th>政治面貌</th>
            <td>{candidate.politicalAffiliation}</td>
            <th>身份证号</th>
            <td>{candidate.idNumber}</td>
          </tr>
          <tr>
            <th>工作单位</th>
            <td colSpan="3">{candidate.workUnit}</td>
          </tr>
          <tr>
            <th>行政职务</th>
            <td>{candidate.administrativePosition}</td>
            <th>技术职称</th>
            <td>{candidate.technicalTitle}</td>
          </tr>
          <tr>
            <th>最高学位</th>
            <td>{candidate.highestDegree}</td>
            <th>毕业学校</th>
            <td>{candidate.graduateSchool}</td>
          </tr>
          <tr>
            <th>专业、专长</th>
            <td colSpan="3">{candidate.specialty}</td>
          </tr>
          <tr>
            <th>通讯地址</th>
            <td colSpan="3">{candidate.mailingAddress}</td>
          </tr>
          <tr>
            <th>办公电话</th>
            <td>{candidate.officePhone}</td>
            <th>移动电话</th>
            <td>{candidate.mobilePhone}</td>
          </tr>
          <tr>
            <th>电子邮箱</th>
            <td>{candidate.email}</td>
            <th>邮政编码</th>
            <td>{candidate.postalCode}</td>
          </tr>
          <tr>
            <th>推荐单位</th>
            <td colSpan="3">{data.applicantUnit}</td>
          </tr>
        </tbody>
      </table>
      <footer>1</footer>
    </article>
  );
}

function PreviewTextPage({ title, body, pageNumber }) {
  const rich = isHtmlContent(body);
  const isIntroduction = title.startsWith("二、项目简介");
  return (
    <article
      className={`preview-page preview-text-page${isIntroduction ? " preview-introduction-page" : ""}`}
    >
      <table className="preview-section-table" aria-label={title}>
        <tbody>
          <tr>
            <th>{title}</th>
          </tr>
          <tr>
            <td>
              {rich ? (
                <div
                  className="preview-body-text preview-rich-text"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichText(body) }}
                />
              ) : (
                <div className="preview-body-text">{body || "尚未填写。"}</div>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      <footer>{pageNumber}</footer>
    </article>
  );
}

function PreviewTablePage({ title, group, records, pageNumber, continued }) {
  const fields = getPdfFields(group);
  const displayValue = (record, field) => {
    const direct = record[field.key];
    if (direct !== undefined && direct !== null) return direct;
    return (
      field.legacyKeys
        ?.map((key) => record[key])
        .find((value) => value !== undefined && value !== null) ?? ""
    );
  };
  return (
    <article className="preview-page preview-form-page preview-table-page">
      <h3>{continued ? `${title}（续）` : title}</h3>
      <table aria-label={title}>
        <thead>
          <tr>
            <th className="preview-index-column">序号</th>
            {fields.map((field) => (
              <th key={field.key}>{field.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.length ? (
            records.map(({ record, index }) => (
              <tr key={record.id || index}>
                <td className="preview-index-column">{index + 1}</td>
                {fields.map((field) => (
                  <td key={field.key}>{displayValue(record, field)}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr className="preview-empty-row">
              <td colSpan={fields.length + 1}>暂无记录</td>
            </tr>
          )}
        </tbody>
      </table>
      <footer>{pageNumber}</footer>
    </article>
  );
}

function PreviewAwardPage({ records, pageNumber, continued }) {
  const value = (record, key) => record?.[key] ?? "";
  return (
    <article className="preview-page preview-form-page preview-template-table preview-award-page">
      <h3>
        {continued ? "四、本项目曾获奖励情况（续）" : "四、本项目曾获奖励情况"}
      </h3>
      <table aria-label="四、本项目曾获奖励情况">
        <colgroup>
          <col style={{ width: "30.91%" }} />
          <col style={{ width: "14.55%" }} />
          <col style={{ width: "16.36%" }} />
          <col style={{ width: "12.73%" }} />
          <col style={{ width: "25.45%" }} />
        </colgroup>
        <thead>
          <tr>
            <th>获奖项目名称</th>
            <th>获奖时间</th>
            <th>奖项名称</th>
            <th>奖励等级</th>
            <th>授奖部门（组织）</th>
          </tr>
        </thead>
        <tbody>
          {[
            ...records,
            ...Array(Math.max(0, 10 - records.length)).fill({}),
          ].map((record, index) => (
            <tr key={record.id || index}>
              <td>{value(record, "name")}</td>
              <td>{value(record, "date")}</td>
              <td>{value(record, "award")}</td>
              <td>{value(record, "level")}</td>
              <td>{value(record, "org")}</td>
            </tr>
          ))}
          <tr className="preview-note-row">
            <td colSpan="5">
              填写国务院、省／部委／军队、经登记社会力量、国际组织／外国政府设立的科技奖励，无则填“无”。
            </td>
          </tr>
        </tbody>
      </table>
      <footer>{pageNumber}</footer>
    </article>
  );
}

function PreviewIpPage({
  ipRecords,
  technicalEvaluationRecords,
  applicationUnits,
  pageNumber,
  continued,
}) {
  const showIpRecords = !continued || ipRecords.length > 0;
  const showEvaluation = !continued || technicalEvaluationRecords.length > 0;
  const showApplicationUnits = !continued || applicationUnits.length > 0;
  return (
    <article className="preview-page preview-form-page preview-template-table preview-ip-page">
      <h3>五、申请、获得知识产权情况表{continued ? "（续）" : ""}</h3>
      {showIpRecords && (
        <section className="preview-subtable">
          <h4>1. 知识产权证明目录</h4>
          <table aria-label="1. 知识产权证明目录">
            <colgroup>
              <col style={{ width: "28.17%" }} />
              <col style={{ width: "22.69%" }} />
              <col style={{ width: "13.42%" }} />
              <col style={{ width: "18.06%" }} />
              <col style={{ width: "17.65%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>授权（申请）项目名称</th>
                <th>知识产权类别（发明／实用新型／外观／软著等）</th>
                <th>国（区）别</th>
                <th>申请号</th>
                <th>授权号</th>
              </tr>
            </thead>
            <tbody>
              {(ipRecords.length ? ipRecords : [{}, {}, {}, {}, {}]).map(
                (record, index) => (
                  <tr key={record.id || index}>
                    <td>{record.name || ""}</td>
                    <td>{record.type || ""}</td>
                    <td>{record.country || ""}</td>
                    <td>{record.applicationNumber || ""}</td>
                    <td>{record.authorizationNumber || record.number || ""}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </section>
      )}
      {showEvaluation && (
        <section className="preview-subtable preview-technical-evaluation">
          <h4>2. 技术评价证明及行业审批文件目录</h4>
          <table aria-label="2. 技术评价证明及行业审批文件目录">
            <colgroup>
              <col style={{ width: "25%" }} />
              <col style={{ width: "25%" }} />
              <col style={{ width: "25%" }} />
              <col style={{ width: "25%" }} />
            </colgroup>
            <thead>
              <tr>
                {technicalEvaluationFields.map((field) => (
                  <th key={field.key}>{field.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ...technicalEvaluationRecords,
                ...Array(Math.max(0, 4 - technicalEvaluationRecords.length)).fill({}),
              ].map((record, index) => (
                <tr key={record.id || index}>
                  {technicalEvaluationFields.map((field) => (
                    <td key={field.key}>{record[field.key] || ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {showApplicationUnits && (
        <section className="preview-subtable preview-application-units">
          <h4>3. 应用单位目录</h4>
          <table aria-label="3. 应用单位目录">
            <colgroup>
              <col style={{ width: "28%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "25%" }} />
              <col style={{ width: "25%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>应用单位名称</th>
                <th>应用起始时间（年／月）</th>
                <th>联系人及电话</th>
                <th>使用本项目产生的经济效益（万元）</th>
              </tr>
            </thead>
            <tbody>
              {(applicationUnits.length
                ? applicationUnits
                : [{}, {}, {}, {}]
              ).map((record, index) => (
                <tr key={record.id || index}>
                  <td>{record.unitName || record.name || ""}</td>
                  <td>{record.startDate || ""}</td>
                  <td>{record.contactPhone || ""}</td>
                  <td>{record.economicBenefit || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <footer>{pageNumber}</footer>
    </article>
  );
}

function PreviewEconomicPage({ data, pageNumber }) {
  const records = data.economicRecords || [];
  const amountFields = getPdfFields("economicRecords").filter(
    (field) => field.key !== "year",
  );
  const total = (key) =>
    records.reduce((sum, record) => sum + (Number(record[key]) || 0), 0) || "";
  return (
    <article className="preview-page preview-form-page preview-economic-page">
      <table aria-label="经济效益数据">
        <colgroup>
          {Array.from({ length: amountFields.length + 1 }, (_, index) => (
            <col
              key={index}
              style={{ width: `${100 / (amountFields.length + 1)}%` }}
            />
          ))}
        </colgroup>
        <tbody>
          <tr className="preview-section-heading-row">
            <th colSpan={amountFields.length + 1}>
              三、项目详细内容　6. 经济效益（标准、软科学类项目可以不填此栏）
              <span className="preview-table-unit">单位：万元人民币</span>
            </th>
          </tr>
          <tr>
            <th>项目总投资额</th>
            <td colSpan="2">{data.economicSummary?.totalInvestment || ""}</td>
            <th>回收期（年）</th>
            <td>{data.economicSummary?.paybackYears || ""}</td>
          </tr>
          <tr>
            <th>年度</th>
            {amountFields.map((field) => (
              <th key={field.key}>
                {field.label}
                {field.key === "foreignExchange" ? "（万美元）" : ""}
              </th>
            ))}
          </tr>
          {records.map((record, index) => (
            <tr key={record.id || index}>
              <td>{record.year}</td>
              {amountFields.map((field) => (
                <td key={field.key}>{record[field.key]}</td>
              ))}
            </tr>
          ))}
          <tr>
            <th colSpan="1">累计</th>
            {amountFields.map((field) => (
              <td key={field.key}>{total(field.key)}</td>
            ))}
          </tr>
        </tbody>
        <tbody className="preview-economic-basis">
          <tr>
            <td colSpan={amountFields.length + 1}>
              <strong>各栏目的计算依据：</strong>
              <PreviewRichValue value={data.economic} />
              <span className="preview-word-limit">（限 300 字）</span>
            </td>
          </tr>
        </tbody>
      </table>
      <footer>{pageNumber}</footer>
    </article>
  );
}

function PreviewRichValue({ value, className = "" }) {
  return isHtmlContent(value) ? (
    <div
      className={`preview-cell-rich ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(value) }}
    />
  ) : (
    <div className={`preview-cell-rich ${className}`}>{value || ""}</div>
  );
}

function PreviewPersonPage({ person, index, pageNumber }) {
  return (
    <article className="preview-page preview-form-page preview-entity-page preview-person-page">
      <h3>六、主要完成人情况表</h3>
      <table aria-label={`第 ${index + 1} 完成人情况表`}>
        <colgroup>
          <col style={{ width: "6.5%" }} />
          <col style={{ width: "7.22%" }} />
          <col style={{ width: "19.86%" }} />
          <col style={{ width: "7.22%" }} />
          <col style={{ width: "9.18%" }} />
          <col style={{ width: "3.46%" }} />
          <col style={{ width: "13.2%" }} />
          <col style={{ width: "13.89%" }} />
          <col style={{ width: "19.45%" }} />
        </colgroup>
        <tbody>
          <tr>
            <th colSpan="2">姓 名</th>
            <td colSpan="2">{person.name}</td>
            <th colSpan="2">性别</th>
            <td>{person.gender}</td>
            <th>排名</th>
            <td>第 {index + 1} 完成人</td>
          </tr>
          <tr>
            <th colSpan="2">出生年月</th>
            <td colSpan="2">{person.birthDate}</td>
            <th colSpan="2">出生地</th>
            <td>{person.birthPlace}</td>
            <th>民族</th>
            <td>{person.ethnicity}</td>
          </tr>
          <tr>
            <th colSpan="2">籍贯</th>
            <td colSpan="7">{person.nativePlace}</td>
          </tr>
          <tr>
            <th colSpan="2">身份证号</th>
            <td colSpan="2">{person.idNumber}</td>
            <th colSpan="2">党 派</th>
            <td>{person.politicalAffiliation}</td>
            <th>国籍</th>
            <td>{person.nationality}</td>
          </tr>
          <tr>
            <th colSpan="2">行政职务</th>
            <td colSpan="2">{person.administrativePosition}</td>
            <th colSpan="2">归国人员</th>
            <td>{person.returnee}</td>
            <th>归国时间</th>
            <td>{person.returnDate}</td>
          </tr>
          <tr>
            <th colSpan="2">工作单位</th>
            <td colSpan="5">{person.workUnit}</td>
            <th>办公电话</th>
            <td>{person.officePhone}</td>
          </tr>
          <tr>
            <th colSpan="2">通讯地址</th>
            <td colSpan="5">{person.mailingAddress}</td>
            <th>邮政编码</th>
            <td>{person.postalCode}</td>
          </tr>
          <tr>
            <th colSpan="2">家庭住址</th>
            <td colSpan="5">{person.homeAddress}</td>
            <th>住宅电话</th>
            <td>{person.homePhone}</td>
          </tr>
          <tr>
            <th colSpan="2">电子信箱</th>
            <td colSpan="5">{person.email}</td>
            <th>移动电话</th>
            <td>{person.mobilePhone}</td>
          </tr>
          <tr>
            <th colSpan="2">毕业学校</th>
            <td>{person.graduateSchool}</td>
            <th colSpan="2">毕业时间</th>
            <td colSpan="2">{person.graduationDate}</td>
            <th colSpan="1">文化程度</th>
            <td>{person.education}</td>
          </tr>
          <tr>
            <th colSpan="2">技术职称</th>
            <td>{person.technicalTitle}</td>
            <th colSpan="2">专业、专长</th>
            <td colSpan="2">{person.specialty}</td>
            <th colSpan="1">最高学位</th>
            <td>{person.highestDegree}</td>
          </tr>
          <tr>
            <th colSpan="3">曾获奖励及荣誉称号情况</th>
            <td colSpan="6">{person.awards}</td>
          </tr>
          <tr>
            <th colSpan="3">参加本项目的起止时间</th>
            <td colSpan="6">{person.projectPeriod}</td>
          </tr>
          <tr>
            <th colSpan="3">备注</th>
            <td colSpan="6">{person.notes}</td>
          </tr>
          <tr className="preview-contribution-row">
            <td colSpan="9">
              <strong>对本项目主要科学技术贡献：</strong>
              <span>（简明阐述核心贡献，与创新点对应）</span>
              <PreviewRichValue value={person.contribution} />
            </td>
          </tr>
          <tr className="preview-declaration-row">
            <th>
              <span>声</span>
              <span>明</span>
            </th>
            <td colSpan="8">
              <p>
                本人对申报书内容及全部附件材料进行了审查，内容和材料均属实，对推荐材料的真实性负责，并同意本人在“主要完成人”中的排序。
              </p>
              <p className="preview-signature-line">本人签名：</p>
              <p className="preview-date-line">
                年&nbsp;&nbsp;&nbsp;&nbsp;月&nbsp;&nbsp;&nbsp;&nbsp;日
              </p>
            </td>
          </tr>
        </tbody>
      </table>
      <footer>{pageNumber}</footer>
    </article>
  );
}

function PreviewUnitPage({ unit, index, pageNumber }) {
  return (
    <article className="preview-page preview-form-page preview-entity-page preview-unit-page">
      <h3>七、主要完成单位情况表</h3>
      <table aria-label={`第 ${index + 1} 完成单位情况表`}>
        <tbody>
          <tr>
            <th>单位名称</th>
            <td colSpan="3">{unit.name}</td>
            <th>所在地</th>
            <td>{unit.location}</td>
          </tr>
          <tr>
            <th>排名</th>
            <td>第 {index + 1} 完成单位</td>
            <th>单位性质</th>
            <td colSpan="3">{unit.nature}</td>
          </tr>
          <tr>
            <th>联系人</th>
            <td>{unit.contact}</td>
            <th>联系电话</th>
            <td>{unit.phone}</td>
            <th>移动电话</th>
            <td>{unit.mobilePhone}</td>
          </tr>
          <tr>
            <th>通讯地址及邮政编码</th>
            <td colSpan="5">
              {[unit.address, unit.postalCode].filter(Boolean).join("，")}
            </td>
          </tr>
          <tr>
            <th>电子邮箱</th>
            <td colSpan="2">{unit.email}</td>
            <td colSpan="3" className="preview-unit-note">
              注：务必确保以上相关信息完整无误。
            </td>
          </tr>
          <tr className="preview-contribution-row preview-unit-contribution">
            <td colSpan="6">
              <strong>
                对本项目技术创新和应用的贡献（限 500
                字，阐述单位在研发、资金、场地、试验、推广等方面的核心支持与贡献）
              </strong>
              <PreviewRichValue value={unit.contribution} />
              <div className="preview-stamp-block">
                <div>单位盖章：</div>
                <div>
                  年&nbsp;&nbsp;&nbsp;&nbsp;月&nbsp;&nbsp;&nbsp;&nbsp;日
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <footer>{pageNumber}</footer>
    </article>
  );
}

function PreviewRecommendationPage({ body, pageNumber }) {
  return (
    <article className="preview-page preview-form-page preview-recommendation-page">
      <h3>八、申报、推荐单位意见</h3>
      <p className="preview-recommendation-note">（专家推荐不填此栏）</p>
      <table
        className="preview-recommendation-table"
        aria-label="申报、推荐单位意见"
      >
        <tbody>
          <tr>
            <td>
              <h4>
                申报单位意见：（明确表述对项目的真实性、创新性、应用价值的审核意见，及推荐申报的意愿）
              </h4>
              <PreviewRichValue value={body} />
              <div className="preview-signature-area">
                <span>申报单位公章</span>
                <span>
                  年&nbsp;&nbsp;&nbsp;&nbsp;月&nbsp;&nbsp;&nbsp;&nbsp;日
                </span>
              </div>
            </td>
          </tr>
          <tr>
            <td>
              <h4>
                推荐单位推荐意见：（明确推荐等级：□一等奖 □二等奖
                □三等奖，阐述推荐理由）
              </h4>
              <div className="preview-blank-lines" />
              <div className="preview-signature-area">
                <span>推荐单位公章</span>
                <span>
                  年&nbsp;&nbsp;&nbsp;&nbsp;月&nbsp;&nbsp;&nbsp;&nbsp;日
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <footer>{pageNumber}</footer>
    </article>
  );
}

function splitPreviewContent(content, maxLength = 1250) {
  const source = String(content || "").trim();
  if (!source) return ["尚未填写。"];
  if (!isHtmlContent(source)) {
    const chunks = [];
    for (let start = 0; start < source.length; start += maxLength) {
      chunks.push(source.slice(start, start + maxLength));
    }
    return chunks;
  }
  const documentNode = new DOMParser().parseFromString(
    sanitizeRichText(source),
    "text/html",
  );
  const chunks = [];
  let nodes = [];
  let length = 0;
  const flush = () => {
    if (!nodes.length) return;
    chunks.push(nodes.map((node) => node.outerHTML).join(""));
    nodes = [];
    length = 0;
  };
  for (const node of [...documentNode.body.children]) {
    const nodeLength =
      (node.textContent || "").length + (node.tagName === "IMG" ? 500 : 0);
    if (nodes.length && length + nodeLength > maxLength) flush();
    nodes.push(node);
    length += nodeLength;
  }
  flush();
  return chunks.length ? chunks : ["尚未填写。"];
}

function buildPreviewSections(sourceData) {
  const data = normalizeApplicationData(sourceData);
  const profile = getAwardProfile(data.awardType);
  const pages = [];
  const addTablePages = (title, group, records, pageSize = 8) => {
    const source = records?.length ? records : [];
    const chunks = source.length
      ? Array.from(
          { length: Math.ceil(source.length / pageSize) },
          (_, index) => source.slice(index * pageSize, (index + 1) * pageSize),
        )
      : [[]];
    chunks.forEach((chunk, pageIndex) =>
      pages.push({
        kind: "table",
        title,
        group,
        continued: pageIndex > 0,
        records: chunk.map((record, index) => ({
          record,
          index: pageIndex * pageSize + index,
        })),
      }),
    );
  };
  if (profile.code === "achievement") {
    addTablePages(
      "二、所获科技奖励和荣誉称号情况",
      "awardRecords",
      data.awardRecords,
      10,
    );
    addTablePages(
      "三、发表论文和专著情况",
      "paperRecords",
      data.paperRecords,
      8,
    );
    addTablePages("四、所获知识产权证书", "ipRecords", data.ipRecords, 6);
    addTablePages(
      "五、承担科研项目情况",
      "researchRecords",
      data.researchRecords,
      7,
    );
    addTablePages(
      "六、参与重大工程技术项目情况",
      "engineeringRecords",
      data.engineeringRecords,
      7,
    );
    splitPreviewContent(data.transformation).forEach((body, index) =>
      pages.push({
        kind: "text",
        title: `七、科技成果转化及推广情况${index ? "（续）" : ""}`,
        body,
      }),
    );
    pages.push({
      kind: "text",
      title: "八、附件",
      body: "科技奖励和荣誉、代表性论文专著、知识产权、科研项目、成果效益及其他证明材料以系统上传附件为准。",
    });
    pages.push({
      kind: "text",
      title: "九、真实性承诺书",
      body: "以本章上传 Word 为准。",
    });
    pages.push({
      kind: "text",
      title: "十、诚信承诺书",
      body: "以本章上传 Word 为准。",
    });
    return pages;
  }
  const textSections = [
    ["二、项目简介", data.introduction],
    ...profile.detailFields.map(([key, label]) => [
      `三、项目详细内容（${label}）`,
      data[key],
    ]),
    ["三、项目详细内容（4．与当前国内外同类技术的比较）", data.comparison],
    ["三、项目详细内容（5．应用情况）", data.application],
  ];
  for (const [title, content = ""] of textSections) {
    splitPreviewContent(content).forEach((body, index) => {
      pages.push({
        kind: "text",
        title: index ? `${title}（续）` : title,
        body,
      });
    });
  }
  pages.push({
    kind: "economic",
    title: "三、项目详细内容（6．经济效益）",
    data,
  });
  splitPreviewContent(data.social).forEach((body, index) =>
    pages.push({
      kind: "text",
      title: `三、项目详细内容（7. 社会效益）${index ? "（续）" : ""}`,
      body,
    }),
  );
  const awardChunks = data.awardRecords?.length
    ? Array.from(
        { length: Math.ceil(data.awardRecords.length / 12) },
        (_, index) => data.awardRecords.slice(index * 12, (index + 1) * 12),
      )
    : [[]];
  awardChunks.forEach((records, index) =>
    pages.push({
      kind: "award",
      title: "四、本项目曾获奖励情况",
      continued: index > 0,
      records,
    }),
  );
  const evaluationRecords = technicalEvaluationRows(data.technicalEvaluation);
  const ipPageCount = Math.max(
    1,
    Math.ceil((data.ipRecords?.length || 0) / 5),
    Math.ceil(evaluationRecords.length / 4),
    Math.ceil((data.applicationUnits?.length || 0) / 4),
  );
  for (let index = 0; index < ipPageCount; index += 1) {
    pages.push({
      kind: "ip",
      title: "五、申请、获得知识产权情况表",
      continued: index > 0,
      ipRecords: (data.ipRecords || []).slice(index * 5, (index + 1) * 5),
      technicalEvaluationRecords: evaluationRecords.slice(index * 4, (index + 1) * 4),
      applicationUnits: (data.applicationUnits || []).slice(
        index * 4,
        (index + 1) * 4,
      ),
    });
  }
  data.people.forEach((person, index) =>
    pages.push({
      kind: "person",
      title: `第 ${index + 1} 完成人`,
      person,
      index,
    }),
  );
  data.units.forEach((unit, index) =>
    pages.push({
      kind: "unit",
      title: `第 ${index + 1} 完成单位`,
      unit,
      index,
    }),
  );
  pages.push({
    kind: "recommendation",
    title: "八、申报、推荐单位意见",
    body: data.recommendation,
  });
  pages.push({
    kind: "text",
    title: "九、专家推荐意见",
    body: "以本章上传 Word 为准。",
  });
  pages.push({
    kind: "text",
    title: "十、附件目录",
    body: "证明材料以系统上传附件为准。",
  });
  pages.push({
    kind: "text",
    title: "十一、真实性承诺书",
    body: "以本章上传 Word 为准。",
  });
  pages.push({
    kind: "text",
    title: "十二、不涉密承诺函",
    body: "以本章上传 Word 为准。",
  });
  pages.push({
    kind: "text",
    title: "十三、诚信承诺书",
    body: "以本章上传 Word 为准。",
  });
  return pages;
}

function PreviewDialog({
  data,
  onClose,
  applicationId,
  sourceFile,
  disciplineRecords,
}) {
  const pagesRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const previewPages = useMemo(() => buildPreviewSections(data), [data]);
  const pageCount = previewPages.length + 1;
  const exportSelectedPdf = async (label, selector, fileSuffix) => {
    setExporting(true);
    try {
      const pages = [...pagesRef.current.querySelectorAll(selector)];
      if (!pages.length) {
        window.alert(`当前暂无可导出的${label}内容`);
        return;
      }
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      for (let index = 0; index < pages.length; index += 1) {
        if (index) pdf.addPage();
        const canvas = await html2canvas(pages[index], {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
        });
        pdf.addImage(
          canvas.toDataURL("image/jpeg", 0.95),
          "JPEG",
          0,
          0,
          210,
          297,
        );
      }
      pdf.save(
        `${data.projectName || "中国节能协会创新奖"}-${fileSuffix}-盖章版.pdf`,
      );
    } finally {
      setExporting(false);
    }
  };
  const exportPdf = () =>
    exportSelectedPdf("申报书", ".preview-page", "申报书");
  return (
    <div className="preview-shell">
      <div className="preview-toolbar">
        <div>
          <FileText size={20} />
          <span>
            <b>申报书预览</b>
            <small>共 {pageCount} 页 · A4 纵向</small>
          </span>
        </div>
        <div className="preview-actions">
          <button className="secondary-button" onClick={onClose}>
            返回填写
          </button>
          <button
            className="primary-button"
            onClick={exportPdf}
            disabled={exporting}
          >
            {exporting ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Download size={17} />
            )}
            {exporting ? "正在生成" : "导出系统生成 PDF"}
          </button>
          <div className="seal-export-menu" aria-label="独立盖章导出">
            <span>独立盖章导出</span>
            <button
              className="secondary-button"
              disabled={exporting}
              onClick={() =>
                exportSelectedPdf("首页", ".preview-page:first-child", "首页")
              }
            >
              首页
            </button>
            <button
              className="secondary-button"
              disabled={exporting}
              onClick={() =>
                exportSelectedPdf("完成人", ".preview-person-page", "完成人")
              }
            >
              完成人
            </button>
            <button
              className="secondary-button"
              disabled={exporting}
              onClick={() =>
                exportSelectedPdf("完成单位", ".preview-unit-page", "完成单位")
              }
            >
              完成单位
            </button>
            <button
              className="secondary-button"
              disabled={exporting}
              onClick={() =>
                exportSelectedPdf(
                  "申报推荐单位意见",
                  ".preview-recommendation-page",
                  "申报推荐单位意见",
                )
              }
            >
              申报推荐单位意见
            </button>
          </div>
          {sourceFile && (
            <a
              className="primary-button"
              href={`/api/applications/${applicationId}/files/${sourceFile.id}/download`}
            >
              <FileDown size={17} />
              一键导出最终版 PDF
            </a>
          )}
        </div>
      </div>
      <div className="preview-workspace">
        <aside>
          <button className="page-thumb active">
            <span className="mini-page">
              <i />
            </span>
            <b>第 1 页</b>
            <small>基本情况</small>
          </button>
          {previewPages.map((page, index) => (
            <button
              className="page-thumb"
              key={`${page.title}-${index}`}
              onClick={() =>
                pagesRef.current?.children[index + 1]?.scrollIntoView({
                  behavior: "smooth",
                })
              }
            >
              <span className="mini-page mini-page--text">
                <i />
              </span>
              <b>第 {index + 2} 页</b>
              <small>
                {page.title.replace(/[一二三四五六七八九十]+、/, "")}
              </small>
            </button>
          ))}
        </aside>
        <main className="preview-pages" ref={pagesRef}>
          {getAwardProfile(data.awardType).code === "achievement" ? (
            <PreviewAchievementPageOne data={data} />
          ) : (
            <PreviewPageOne data={data} disciplineRecords={disciplineRecords} />
          )}
          {previewPages.map((page, index) => {
            const pageNumber = index + 2;
            if (page.kind === "award") {
              return (
                <PreviewAwardPage
                  key={`award-${index}`}
                  {...page}
                  pageNumber={pageNumber}
                />
              );
            }
            if (page.kind === "ip") {
              return (
                <PreviewIpPage
                  key={`ip-${index}`}
                  {...page}
                  pageNumber={pageNumber}
                />
              );
            }
            if (page.kind === "table") {
              return (
                <PreviewTablePage
                  key={`${page.title}-${index}`}
                  {...page}
                  pageNumber={pageNumber}
                />
              );
            }
            if (page.kind === "economic") {
              return (
                <PreviewEconomicPage
                  key={`${page.title}-${index}`}
                  data={page.data}
                  pageNumber={pageNumber}
                />
              );
            }
            if (page.kind === "person") {
              return (
                <PreviewPersonPage
                  key={page.person.id}
                  {...page}
                  pageNumber={pageNumber}
                />
              );
            }
            if (page.kind === "unit") {
              return (
                <PreviewUnitPage
                  key={page.unit.id}
                  {...page}
                  pageNumber={pageNumber}
                />
              );
            }
            if (page.kind === "recommendation") {
              return (
                <PreviewRecommendationPage
                  key={`recommendation-${index}`}
                  body={page.body}
                  pageNumber={pageNumber}
                />
              );
            }
            return (
              <PreviewTextPage
                key={`${page.title}-${index}`}
                {...page}
                pageNumber={pageNumber}
              />
            );
          })}
        </main>
      </div>
    </div>
  );
}

function CreateApplicationDialog({ onClose, onCreated }) {
  const [form, setForm] = useState({
    title: "",
    awardType: "节能减排科技进步奖",
    year: "2026",
    applicationChannel: "自由申报",
    applicantUnit: "",
    workflowMode: "form",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedAward = awardOptions.find(
    (option) => option.value === form.awardType,
  );
  const isAchievement =
    form.awardType === AWARD_TYPES.ACHIEVEMENT ||
    selectedAward?.code === "achievement";
  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) {
      setError(isAchievement ? "请填写候选人姓名" : "请填写项目名称");
      return;
    }
    if (!form.applicantUnit.trim()) {
      setError("请填写申报或推荐单位");
      return;
    }
    setSaving(true);
    try {
      const response = await apiFetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok)
        throw new Error(payload.message || "创建失败");
      onCreated(payload.application);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };
  return (
    <div className="modal-layer">
      <form className="dialog create-dialog" onSubmit={submit}>
        <div className="dialog-head">
          <div>
            <span className="dialog-icon">
              <Plus size={20} />
            </span>
            <span>
              <b>新建申报材料</b>
              <small>先确定奖项类别与申报渠道，再创建独立填报草稿</small>
            </span>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={20} />
          </button>
        </div>
        <div className="dialog-body create-form create-form--award">
          <div className="create-deadline-summary">
            <CalendarDays size={17} />
            <span>
              <b>2026 年度材料提交已于 7 月 31 日 17:00 截止</b>
              <small>
                本地演示环境仍允许创建和维护草稿，不代表协会恢复受理。
              </small>
            </span>
          </div>
          <fieldset className="award-choice-field">
            <legend>奖项类别</legend>
            <div className="award-choice-grid">
              {awardOptions.map((option) => (
                <label
                  key={option.value}
                  className={
                    form.awardType === option.value
                      ? "award-choice active"
                      : "award-choice"
                  }
                >
                  <input
                    type="radio"
                    name="awardType"
                    value={option.value}
                    checked={form.awardType === option.value}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        awardType: event.target.value,
                        workflowMode:
                          option.code === "achievement"
                            ? "form"
                            : current.workflowMode,
                      }))
                    }
                  />
                  <span className="award-choice-head">
                    <b>{option.value}</b>
                    <i>{option.mode}</i>
                  </span>
                  <small>{option.summary}</small>
                </label>
              ))}
            </div>
            <p className="award-condition">
              <ShieldCheck size={15} />
              <span>{selectedAward?.conditions}</span>
            </p>
          </fieldset>
          <fieldset className="workflow-choice-field">
            <legend>材料准备方式</legend>
            <div className="workflow-choice-grid">
              <label
                className={
                  form.workflowMode === "form"
                    ? "workflow-choice active"
                    : "workflow-choice"
                }
              >
                <input
                  type="radio"
                  name="workflowMode"
                  checked={form.workflowMode === "form"}
                  onChange={() => setForm({ ...form, workflowMode: "form" })}
                />
                <FileText size={20} />
                <span>
                  <b>从零在线填报</b>
                  <small>
                    逐项录入内容，系统自动保存，最后生成完整申报书 PDF。
                  </small>
                </span>
              </label>
              {!isAchievement && (
                <label
                  className={
                    form.workflowMode === "document"
                      ? "workflow-choice active"
                      : "workflow-choice"
                  }
                >
                  <input
                    type="radio"
                    name="workflowMode"
                    checked={form.workflowMode === "document"}
                    onChange={() =>
                      setForm({ ...form, workflowMode: "document" })
                    }
                  />
                  <ScanText size={20} />
                  <span>
                    <b>导入完整材料</b>
                    <small>
                      上传已合并、签章的
                      PDF，识别回填字段并保留原件用于最终导出。
                    </small>
                  </span>
                </label>
              )}
            </div>
          </fieldset>
          <label>
            <span>申报年度</span>
            <select
              className="control"
              value={form.year}
              onChange={(event) =>
                setForm({ ...form, year: event.target.value })
              }
            >
              <option value="2026">2026 年度</option>
            </select>
          </label>
          <label>
            <span>申报渠道</span>
            <select
              className="control"
              value={form.applicationChannel}
              onChange={(event) =>
                setForm({ ...form, applicationChannel: event.target.value })
              }
            >
              {applicationChannels.map((channel) => (
                <option key={channel}>{channel}</option>
              ))}
            </select>
          </label>
          <label className="create-title-field">
            <span>申报或推荐单位</span>
            <input
              className="control"
              placeholder="填写单位全称；个人自由申报可填写个人申报"
              value={form.applicantUnit}
              onChange={(event) => {
                setForm({ ...form, applicantUnit: event.target.value });
                setError("");
              }}
            />
          </label>
          <label className="create-title-field">
            <span>{isAchievement ? "候选人姓名" : "项目名称"}</span>
            <textarea
              className="control textarea--compact"
              autoFocus
              placeholder={
                isAchievement
                  ? "填写科技成就奖候选人姓名"
                  : "填写拟申报项目的中文名称"
              }
              value={form.title}
              onChange={(event) => {
                setForm({ ...form, title: event.target.value });
                setError("");
              }}
            />
          </label>
          {error && <div className="create-error">{error}</div>}
        </div>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Plus size={17} />
            )}
            {saving ? "正在创建" : "创建申报材料"}
          </button>
        </div>
      </form>
    </div>
  );
}

function PortalPageTitle({
  eyebrow,
  title,
  description,
  onNew,
  className = "",
}) {
  return (
    <div className={`info-page-title ${className}`.trim()}>
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        {description && <span>{description}</span>}
      </div>
      {onNew && (
        <button className="primary-button" onClick={onNew}>
          <Plus size={17} />
          新建申报材料
        </button>
      )}
    </div>
  );
}

function AnnouncementCenter({ onNew }) {
  const schedule = [
    ["申报启动", "2026.04.07", "通知发布之日起"],
    ["材料截止", "2026.07.31 17:00", "邮寄送达或电子邮件发送时间为准"],
    ["形式审查", "2026.08.01 - 08.20", "完整性、合规性审查及补正"],
    ["初审与复审", "2026.08 - 09", "复审名单在协会官网公示"],
    ["终审与公示", "2026.10", "获奖名单公示不少于 5 个工作日"],
    ["授奖", "2026 年度协会年会或相关论坛", "举行公开授奖仪式"],
  ];
  return (
    <>
      <PortalPageTitle
        className="announcement-page-title"
        eyebrow="通知公告"
        title="2026 年度申报工作通知"
        description="内容依据协会 2026 年申报通知、奖励办法及官网公告整理。"
        onNew={onNew}
      />
      <div className="source-banner announcement-source-banner">
        <AlertCircle size={18} />
        <span>
          <b>本年度材料提交已截止</b>
          截止时间为 2026 年 7 月 31 日
          17:00。本系统可继续作为材料整理和演示环境使用。
        </span>
        <a href={officialAwardUrl} target="_blank" rel="noreferrer">
          协会创新奖官网 <ExternalLink size={14} />
        </a>
      </div>
      <section className="info-surface notice-article">
        <div className="notice-article-head">
          <span className="notice-type">申报通知</span>
          <div>
            <h2>
              中国节能协会关于开展 2026 年度“中国节能协会创新奖”申报工作的通知
            </h2>
            <p>
              通知落款：2026-04-07　官网发布：2026-04-13　来源：中国节能协会
            </p>
          </div>
          <a
            className="secondary-button"
            href={referenceDocuments[0].href}
            target="_blank"
          >
            <FileDown size={16} /> 查看原文
          </a>
        </div>
        <div className="notice-section">
          <h3>奖项设置与申报范围</h3>
          <p>
            面向全国节能减排领域，在科学研究、技术发明、成果应用与产业化、工艺创新等方面作出突出贡献的单位和个人。已获省部级及以上科学技术奖励、涉密项目以及无实质性技术创新的成果不属于申报范围。
          </p>
          <div className="award-rule-grid">
            {awardOptions.map((award) => (
              <div key={award.value}>
                <span>{award.mode}</span>
                <b>{award.value}</b>
                <p>{award.conditions}</p>
              </div>
            ))}
          </div>
          <p className="plain-note">
            科技成就奖不分等级；科技进步奖和技术发明奖设特等奖、一等奖、二等奖，特等奖为非常设奖项且不单独接受申报。
          </p>
        </div>
        <div className="notice-section">
          <h3>申报渠道与必备材料</h3>
          <div className="two-column-copy">
            <div>
              <b>四种申报渠道</b>
              <ol>
                <li>科研院所、高等院校推荐</li>
                <li>行业、地方节能相关协会推荐</li>
                <li>节能减排领域相关企事业单位推荐</li>
                <li>自由申报；同一项目不得重复申报</li>
              </ol>
            </div>
            <div>
              <b>核心材料</b>
              <ol>
                <li>统一格式申报书，完成签字盖章</li>
                <li>国家科技成果登记系统登记的科技成果评价报告</li>
                <li>知识产权、应用、节能减排效果及经济社会效益证明</li>
                <li>不涉密承诺函、诚信承诺书及其他必要附件</li>
              </ol>
            </div>
          </div>
        </div>
        <div className="notice-section">
          <h3>时间安排</h3>
          <div className="schedule-list">
            {schedule.map(([name, date, detail], index) => (
              <div key={name} className={index === 1 ? "deadline" : ""}>
                <i>{index + 1}</i>
                <span>
                  <b>{name}</b>
                  <small>{detail}</small>
                </span>
                <strong>{date}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="notice-section">
          <h3>材料格式与提交方式</h3>
          <div className="format-facts">
            <span>
              <b>A4 竖装</b>
              <small>左边装订边不少于 25 mm，正文文字不小于 5 号</small>
            </span>
            <span>
              <b>纸质 3 份</b>
              <small>
                至少 1 份原件，申报书与附件依次装订，正反面打印或复印
              </small>
            </span>
            <span>
              <b>电子版 2 套</b>
              <small>Word 和 PDF 格式各 1 套，与纸质版内容完全一致</small>
            </span>
          </div>
        </div>
      </section>
      <section className="contact-strip">
        <div>
          <MapPin size={18} />
          <span>
            <b>邮寄地址</b>北京市朝阳区和平街 11 区 37 号楼北侧 2
            楼，中国节能协会科技创新部（100029）
          </span>
        </div>
        <div>
          <Phone size={18} />
          <span>
            <b>联系人与电话</b>马勇　010-64525328 / 18514793086
          </span>
        </div>
        <div>
          <Mail size={18} />
          <span>
            <b>电子邮箱</b>may@cecaweb.org.cn
          </span>
        </div>
        <div>
          <Clock3 size={18} />
          <span>
            <b>咨询时间</b>工作日 9:00-11:30、14:00-17:00
          </span>
        </div>
      </section>
    </>
  );
}

function FaqCenter() {
  const questions = [
    [
      "2026 年度材料提交截止到什么时候？",
      "截止时间为 2026 年 7 月 31 日 17:00。纸质材料以邮戳或送达时间为准，电子版以邮件发送时间为准。",
    ],
    [
      "可以申报哪些奖项？",
      "设节能减排科技成就奖、节能减排科技进步奖、节能减排技术发明奖三个一级子奖项。科技成就奖为个人奖且不分等级；其余两项为项目奖。特等奖不单独申报。",
    ],
    [
      "科技进步奖和技术发明奖对应用年限有什么要求？",
      "科技进步奖成果应实践应用超过 1 年；技术发明奖成果应试验、应用超过 2 年。两类项目均要求近 2 年完成国家科技成果登记系统登记的科技成果评价。",
    ],
    [
      "申报是否收费？",
      "不收取任何申报费用。协会奖励工作使用非财政性经费，不直接或变相向申报单位、个人收费。",
    ],
    [
      "可以通过哪些渠道申报？",
      "可由科研院所或高校、行业或地方节能协会、相关企事业单位推荐，也可自由申报。同一项目不得通过不同渠道重复申报。",
    ],
    [
      "纸质版和电子版分别需要几份？",
      "纸质材料一式 3 份，至少 1 份原件；电子版提交 Word 与 PDF 各 1 套，且内容必须与纸质版完全一致。",
    ],
    [
      "项目已经获得其他科技奖励，还能申报吗？",
      "已经获得省部级以上（含）科学技术奖励的项目不得申报。申报项目还不得存在权属、主要完成人、完成单位及排序争议。",
    ],
    [
      "附件一般包括哪些内容？",
      "主要包括技术研发或验收评估材料、应用及效益证明、科技成果评价报告、查新报告、知识产权证明、完成人身份证明、完成单位营业执照和其他检测或奖励证明。",
    ],
    [
      "在线填报后是否等于正式报送？",
      "不是。本地系统用于建立草稿、整理附件和生成预览。正式申报仍应按协会当年通知要求完成签字盖章，并通过通知载明的纸质和电子渠道提交。",
    ],
    [
      "PDF 智能导入支持扫描件吗？",
      "当前可识别带文本层的 PDF，并生成待人工确认的字段草稿；纯扫描件 OCR 和复杂表格识别尚未接入。",
    ],
  ];
  return (
    <>
      <PortalPageTitle
        eyebrow="填报支持"
        title="常见问题"
        description="集中说明申报资格、材料准备、提交方式和本地系统使用边界。"
      />
      <section className="info-surface faq-surface">
        <div className="faq-intro">
          <CircleHelp size={21} />
          <span>
            <b>申报前建议先核对资格条件</b>
            <small>
              以下答复依据 2026 年申报通知、奖励办法和申报书填写说明整理。
            </small>
          </span>
        </div>
        <div className="faq-list">
          {questions.map(([question, answer], index) => (
            <details key={question} open={index === 0}>
              <summary>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <b>{question}</b>
                <ChevronRight size={17} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}

function ReferenceCenter() {
  return (
    <>
      <PortalPageTitle
        eyebrow="申报指南"
        title="参考资料"
        description="下载当前项目配套的正式通知、办法、申报书和填写说明。"
      />
      <section className="info-surface resource-surface">
        <div className="resource-head">
          <BookOpen size={22} />
          <span>
            <b>2026 年度申报材料包</b>
            <small>共 4 份本地材料，打开后可直接查看或下载。</small>
          </span>
        </div>
        <div className="resource-list">
          {referenceDocuments.map((document, index) => (
            <div key={document.title}>
              <span className="resource-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <FileText size={20} />
              <span>
                <i>{document.type}</i>
                <b>{document.title}</b>
                <small>{document.description}</small>
              </span>
              <a
                className="secondary-button"
                href={document.href}
                target="_blank"
              >
                <FileDown size={16} />
                打开资料
              </a>
            </div>
          ))}
        </div>
      </section>
      <div className="official-link-band">
        <span>
          <ExternalLink size={18} />
          <b>中国节能协会创新奖官网</b>
          <small>评审名单、公示及获奖公告以协会官网实时发布内容为准。</small>
        </span>
        <a
          className="primary-button"
          href={officialAwardUrl}
          target="_blank"
          rel="noreferrer"
        >
          访问官网 <ExternalLink size={15} />
        </a>
      </div>
    </>
  );
}

function Dashboard({ onOpen, user, onLogout }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [portalView, setPortalView] = useState("projects");
  const [year, setYear] = useState("all");
  const [status, setStatus] = useState("all");
  const [keyword, setKeyword] = useState("");
  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (year !== "all") params.set("year", year);
    if (status !== "all") params.set("status", status);
    if (keyword.trim()) params.set("keyword", keyword.trim());
    try {
      const response = await apiFetch(`/api/applications?${params}`);
      const payload = await response.json();
      setApplications(payload.list || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const timer = setTimeout(load, 180);
    return () => clearTimeout(timer);
  }, [year, status, keyword]);
  const openById = async (id) => {
    const response = await apiFetch(`/api/applications/${id}`);
    const payload = await response.json();
    if (payload.ok) onOpen(payload.application);
  };
  const duplicate = async (id) => {
    await apiFetch(`/api/applications/${id}/duplicate`, { method: "POST" });
    load();
  };
  const archive = async (id, title) => {
    if (!window.confirm(`确定将“${title}”移入归档吗？`)) return;
    await apiFetch(`/api/applications/${id}`, { method: "DELETE" });
    load();
  };
  const statusMap = {
    draft: ["草稿", "draft"],
    submitted: ["已提交", "submitted"],
    review: ["形式审查", "review"],
  };
  return (
    <div className="portal-shell">
      <header className="portal-header">
        <div className="portal-brand">
          <span className="brand-mark">
            <span>节</span>
          </span>
          <span>
            <b>中国节能协会创新奖</b>
            <small>申报与评审系统</small>
          </span>
        </div>
        <div className="portal-user">
          <button className="icon-button" title="通知">
            <Bell size={18} />
          </button>
          <span className="user-avatar">
            {(user?.displayName || user?.username || "申").slice(0, 1)}
          </span>
          <span>
            <b>{user?.displayName || user?.username}</b>
            <small>{user?.email}</small>
          </span>
          <button className="icon-button" title="退出登录" onClick={onLogout}>
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <div className="portal-layout">
        <aside className="portal-nav">
          <nav>
            <button
              className={portalView === "projects" ? "active" : ""}
              onClick={() => setPortalView("projects")}
            >
              <FileText size={18} />
              <span>申报项目中心</span>
            </button>
            <button
              className={portalView === "announcements" ? "active" : ""}
              onClick={() => setPortalView("announcements")}
            >
              <Megaphone size={18} />
              <span>公告中心</span>
            </button>
            <button
              className={portalView === "faq" ? "active" : ""}
              onClick={() => setPortalView("faq")}
            >
              <CircleHelp size={18} />
              <span>常见问题</span>
            </button>
            <button
              className={portalView === "references" ? "active" : ""}
              onClick={() => setPortalView("references")}
            >
              <BookOpen size={18} />
              <span>参考资料</span>
            </button>
          </nav>
          <div className="portal-nav-foot">
            <ShieldCheck size={17} />
            <span>数据本地安全存储</span>
          </div>
        </aside>
        <main className="dashboard-main">
          {portalView === "projects" ? (
            <>
              <div className="dashboard-title-row">
                <div>
                  <p>申报工作台</p>
                  <h1>我的申报项目</h1>
                </div>
                <button
                  className="primary-button create-project"
                  onClick={() => setShowCreate(true)}
                >
                  <Plus size={17} />
                  新建申报材料
                </button>
              </div>
              <section className="portal-notice">
                <span className="notice-symbol">
                  <Info size={18} />
                </span>
                <div>
                  <div className="notice-title">
                    <span>重要</span>
                    <b>2026 年度申报安排及材料提交要求</b>
                  </div>
                  <ol>
                    <li>材料提交已于 2026 年 7 月 31 日 17:00 截止。</li>
                    <li>
                      形式审查：8 月 1 日至 20 日；初审与复审：8 月至 9
                      月；终审与公示：10 月。
                    </li>
                    <li>
                      本地系统仍可整理草稿，请确保电子版、纸质版及签字盖章内容一致。
                    </li>
                  </ol>
                  <p>
                    联系人：马勇　010-64525328 / 18514793086　may@cecaweb.org.cn
                  </p>
                </div>
              </section>
              <div className="portal-tip">
                <Info size={15} />
                <span>
                  每个申报项目具有独立的数据、PDF
                  导入记录和保存进度。归档操作不会立即删除数据库记录。
                </span>
              </div>
              <section className="application-panel">
                <div className="panel-headline">
                  <div>
                    <h2>申报项目列表</h2>
                    <span>共 {applications.length} 项</span>
                  </div>
                  <div className="application-filters">
                    <label className="search-control">
                      <Search size={15} />
                      <input
                        value={keyword}
                        placeholder="搜索项目名称"
                        onChange={(event) => setKeyword(event.target.value)}
                      />
                    </label>
                    <select
                      value={year}
                      onChange={(event) => setYear(event.target.value)}
                    >
                      <option value="all">全部年度</option>
                      <option value="2026">2026 年</option>
                      <option value="2027">2027 年</option>
                    </select>
                    <select
                      value={status}
                      onChange={(event) => setStatus(event.target.value)}
                    >
                      <option value="all">全部状态</option>
                      <option value="draft">草稿</option>
                      <option value="submitted">已提交</option>
                    </select>
                  </div>
                </div>
                <div className="application-table-wrap">
                  <table className="application-table">
                    <thead>
                      <tr>
                        <th>序号</th>
                        <th>项目名称</th>
                        <th>奖项类别</th>
                        <th>年度</th>
                        <th>填报进度</th>
                        <th>当前状态</th>
                        <th>最近更新</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan="8" className="table-empty">
                            <LoaderCircle className="spin" size={23} />
                            正在加载项目…
                          </td>
                        </tr>
                      ) : applications.length === 0 ? (
                        <tr>
                          <td colSpan="8" className="table-empty">
                            <FileText size={28} />
                            暂无符合条件的申报项目
                          </td>
                        </tr>
                      ) : (
                        applications.map((item, index) => {
                          const state = statusMap[item.status] || [
                            item.status,
                            "draft",
                          ];
                          return (
                            <tr key={item.id}>
                              <td>{index + 1}</td>
                              <td className="project-title-cell">
                                <button onClick={() => openById(item.id)}>
                                  {item.title}
                                </button>
                                <small>
                                  项目编号：CECA-{item.year}-
                                  {String(item.id).padStart(4, "0")}
                                </small>
                              </td>
                              <td>{item.award_type}</td>
                              <td>{item.year}</td>
                              <td>
                                <div className="table-progress">
                                  <span>
                                    <i style={{ width: `${item.progress}%` }} />
                                  </span>
                                  <b>{item.progress}%</b>
                                </div>
                              </td>
                              <td>
                                <span className={`status-badge ${state[1]}`}>
                                  {state[0]}
                                </span>
                              </td>
                              <td>
                                {new Date(item.updated_at).toLocaleString(
                                  "zh-CN",
                                  {
                                    month: "2-digit",
                                    day: "2-digit",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </td>
                              <td>
                                <div className="row-actions">
                                  <button
                                    className="row-primary"
                                    onClick={() => openById(item.id)}
                                  >
                                    继续填写
                                  </button>
                                  <button
                                    title="复制项目"
                                    onClick={() => duplicate(item.id)}
                                  >
                                    <Copy size={15} />
                                  </button>
                                  <button
                                    title="移入归档"
                                    onClick={() => archive(item.id, item.title)}
                                  >
                                    <Archive size={15} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : portalView === "announcements" ? (
            <AnnouncementCenter onNew={() => setShowCreate(true)} />
          ) : portalView === "faq" ? (
            <FaqCenter />
          ) : (
            <ReferenceCenter />
          )}
        </main>
      </div>
      {showCreate && (
        <CreateApplicationDialog
          onClose={() => setShowCreate(false)}
          onCreated={(application) => {
            setShowCreate(false);
            onOpen(application);
          }}
        />
      )}
    </div>
  );
}

function EditorApp({ application, onHome }) {
  const disciplineRecords = awardDisciplines;
  const [data, setData] = useState(() => {
    const stored = application.data || {};
    let localDraft = {};
    try {
      localDraft = JSON.parse(
        localStorage.getItem(`award-draft-${application.id}`) || "{}",
      );
    } catch {
      localDraft = {};
    }
    const canonicalAwardType =
      application.award_type || stored.awardType || application.awardType;
    const profile = getAwardProfile(canonicalAwardType);
    const emptyData = createEmptyData(application);
    const { candidate: emptyCandidate, ...emptyFields } = emptyData;
    const merged = {
      ...emptyFields,
      ...stored,
      ...localDraft,
      awardType: profile.value,
      applicationMode: profile.mode,
      profileCode: profile.code,
      schemaVersion: 2,
    };
    if (stored.candidate || localDraft.candidate) {
      merged.candidate = {
        ...(stored.candidate || {}),
        ...(localDraft.candidate || {}),
      };
    } else {
      delete merged.candidate;
    }
    const normalized = normalizeApplicationData(merged);
    normalized.candidate = { ...emptyCandidate, ...normalized.candidate };
    return normalized;
  });
  const [active, setActive] = useState("basic");
  const [saveState, setSaveState] = useState("saved");
  const [savedAt, setSavedAt] = useState("");
  const [showImport, setShowImport] = useState(
    getAwardProfile(application.award_type || application.data?.awardType)
      .mode === "project" && application.data?.workflowMode === "document",
  );
  const [wordImportSection, setWordImportSection] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sourceFile, setSourceFile] = useState(null);
  const [applicationFiles, setApplicationFiles] = useState([]);
  const awardProfile = getAwardProfile(data.awardType);
  const sections = useMemo(
    () => getAwardSections(data.awardType),
    [data.awardType],
  );
  const autosaveTimer = useRef(null);
  const latestData = useRef(data);
  const saveQueue = useRef(Promise.resolve());
  const setField = (key, value) =>
    setData((current) => ({ ...current, [key]: value }));
  const loadSourceFile = async () => {
    const response = await apiFetch(
      `/api/applications/${application.id}/files`,
    );
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "附件清单加载失败");
    }
    const files = payload.list || [];
    setApplicationFiles(files);
    setSourceFile(
      files.find((file) => file.file_type === "source_pdf") || null,
    );
    return files;
  };
  const saveToDatabase = (nextData = latestData.current) => {
    const snapshot = normalizeApplicationData(structuredClone(nextData));
    setSaveState("saving");
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(async () => {
        const response = await apiFetch(`/api/applications/${application.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: snapshot }),
        });
        if (!response.ok) throw new Error("保存失败");
        if (JSON.stringify(latestData.current) === JSON.stringify(snapshot)) {
          localStorage.removeItem(`award-draft-${application.id}`);
          setSaveState("saved");
        }
        setSavedAt(
          new Date().toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        );
      })
      .catch((error) => {
        setSaveState("error");
        throw error;
      });
    return saveQueue.current;
  };
  const submitApplication = async () => {
    let currentFiles;
    try {
      currentFiles = await loadSourceFile();
    } catch (error) {
      window.alert(error.message);
      return;
    }
    const validationErrors = validateApplication({
      data,
      awardType: awardProfile.value,
      files: currentFiles,
    });
    if (validationErrors.length) {
      showValidationErrors(validationErrors, "提交前请完善以下内容");
      return;
    }
    await saveToDatabase(data);
    const response = await apiFetch(
      `/api/applications/${application.id}/submit`,
      {
        method: "POST",
      },
    );
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      window.alert(payload.message || "提交失败，请检查必填信息");
      return;
    }
    window.alert("申报项目已提交形式审查，当前版本将保存在项目中心。");
    onHome();
  };
  useEffect(() => {
    latestData.current = data;
    localStorage.setItem(`award-draft-${application.id}`, JSON.stringify(data));
    setSaveState("dirty");
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(
      () => saveToDatabase(data).catch(() => {}),
      700,
    );
    return () => clearTimeout(autosaveTimer.current);
  }, [data]);
  useEffect(() => {
    loadSourceFile().catch(() => {});
    const flush = () => {
      clearTimeout(autosaveTimer.current);
      fetch(`/api/applications/${application.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: normalizeApplicationData(latestData.current),
        }),
        keepalive: true,
      }).catch(() => {});
    };
    const onVisibility = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [application.id]);
  const sectionCompletion = useMemo(() => {
    const hasContent = (value) => {
      const source = String(value || "");
      return (
        /<img\b/i.test(source) ||
        richTextToPlain(source)
          .replace(/\u00a0/g, "")
          .trim().length > 0
      );
    };
    const hasRecord = (records, group) =>
      (records || []).some((record) =>
        getPdfFields(group).some((field) => hasContent(record?.[field.key])),
      );
    const hasSectionFile = (key) =>
      applicationFiles.some(
        (file) =>
          file.file_type === `section_word:${awardProfile.code}:${key}` ||
          file.file_type === `section_signed:${awardProfile.code}:${key}`,
      );
    if (awardProfile.code === "achievement") {
      return {
        basic: [
          data.projectName,
          data.applicantUnit,
          data.candidate?.birthDate,
          data.candidate?.workUnit,
        ].every(hasContent),
        honors: hasRecord(data.awardRecords, "awardRecords"),
        publications: hasRecord(data.paperRecords, "paperRecords"),
        achievementIp: hasRecord(data.ipRecords, "ipRecords"),
        research: hasRecord(data.researchRecords, "researchRecords"),
        engineering: hasRecord(data.engineeringRecords, "engineeringRecords"),
        transformation: hasContent(data.transformation),
        attachments: awardProfile.requiredAttachmentGroups.every(
          ({ categories }) =>
            categories.some((category) =>
              applicationFiles.some((file) => file.file_type === category),
            ),
        ),
        authenticity: hasSectionFile("authenticity"),
        integrity: hasSectionFile("integrity"),
      };
    }
    const hasCompleteSourcePdf =
      data.workflowMode === "document" &&
      applicationFiles.some((file) => file.file_type === "source_pdf");
    return {
      basic: [
        data.projectName,
        data.projectNameEn,
        data.applicantUnit,
        data.contact,
        data.phone,
        data.email,
        data.industry,
        data.startDate,
        data.endDate,
        derivePrimaryDiscipline(data.disciplines)?.name,
        data.sources?.length,
        data.people?.length,
        data.units?.length,
      ].every(hasContent),
      introduction: hasContent(data.introduction),
      details: [
        data.background,
        data.technicalContent,
        data.innovations,
        data.comparison,
        data.application,
      ].every(hasContent),
      awards: hasRecord(data.awardRecords, "awardRecords"),
      ip:
        hasRecord(data.ipRecords, "ipRecords") ||
        hasRecord(data.paperRecords, "paperRecords") ||
        hasContent(data.technicalEvaluation),
      people:
        (data.people || []).length > 0 &&
        data.people.every(
          (person) =>
            hasContent(typeof person === "string" ? person : person?.name) &&
            hasContent(typeof person === "string" ? "" : person?.contribution),
        ),
      units:
        (data.units || []).length > 0 &&
        data.units.every(
          (unit) =>
            hasContent(typeof unit === "string" ? unit : unit?.name) &&
            hasContent(typeof unit === "string" ? "" : unit?.contribution),
        ),
      unitRecommendation:
        hasCompleteSourcePdf || hasSectionFile("unitRecommendation"),
      expertRecommendation: hasSectionFile("expertRecommendation"),
      attachments:
        hasCompleteSourcePdf ||
        awardProfile.requiredAttachmentGroups.every(({ categories }) =>
          categories.some((category) =>
            applicationFiles.some((file) => file.file_type === category),
          ),
        ),
      authenticity: hasSectionFile("authenticity"),
      confidentiality: hasSectionFile("confidentiality"),
      integrity: hasSectionFile("integrity"),
    };
  }, [applicationFiles, awardProfile.code, data]);
  const completeCount = sections.filter(
    ({ key }) => sectionCompletion[key],
  ).length;
  const completion = Math.round((completeCount / sections.length) * 100);
  const showValidationErrors = (errors, heading) => {
    if (!errors.length) return false;
    const firstSection = errors[0].sectionKey;
    if (sections.some(({ key }) => key === firstSection))
      setActive(firstSection);
    const visibleErrors = errors
      .slice(0, 8)
      .map(({ message }) => `- ${message}`);
    if (errors.length > visibleErrors.length) {
      visibleErrors.push(
        `- 另有 ${errors.length - visibleErrors.length} 项待完善`,
      );
    }
    window.alert(`${heading}：\n${visibleErrors.join("\n")}`);
    return true;
  };
  const openPreview = async () => {
    let currentFiles;
    try {
      currentFiles = await loadSourceFile();
    } catch (error) {
      window.alert(error.message);
      return;
    }
    const errors = validateApplication({
      data,
      awardType: awardProfile.value,
      files: currentFiles,
    });
    if (showValidationErrors(errors, "生成预览前请完善以下内容")) return;
    setShowPreview(true);
  };
  const continueFromSection = () => {
    const errors = validateSection({
      data,
      sectionKey: active,
      awardType: awardProfile.value,
      files: applicationFiles,
    });
    if (showValidationErrors(errors, "本页尚未完成")) return;
    if (active === sections.at(-1)?.key) {
      submitApplication();
      return;
    }
    const index = sections.findIndex(({ key }) => key === active);
    if (index < sections.length - 1) setActive(sections[index + 1].key);
  };
  const applyImport = (fields, result) => {
    setData((current) => normalizeApplicationData({ ...current, ...fields }));
    if (result?.sourceFile) {
      const importedSource = {
        ...result.sourceFile,
        file_type: "source_pdf",
      };
      setSourceFile(importedSource);
      setApplicationFiles((current) => [
        importedSource,
        ...current.filter((file) => file.file_type !== "source_pdf"),
      ]);
    }
    setShowImport(false);
  };
  const applyWordImport = async (fields, _result, file) => {
    if (!wordImportSection || !file) throw new Error("未找到待保存的章节 Word");
    const category = `section_word:${awardProfile.code}:${wordImportSection.key}`;
    const body = new FormData();
    body.append("file", file);
    body.append("category", category);
    const uploadResponse = await apiFetch(
      `/api/applications/${application.id}/files`,
      { method: "POST", body },
    );
    const uploadPayload = await uploadResponse.json();
    if (!uploadResponse.ok || !uploadPayload.ok)
      throw new Error(uploadPayload.message || "章节 Word 保存失败");

    const directFields = {};
    const candidateFields = {};
    Object.entries(fields).forEach(([key, value]) => {
      if (key.startsWith("candidate.")) candidateFields[key.slice(10)] = value;
      else directFields[key] = value;
    });
    const nextData = normalizeApplicationData({
      ...data,
      ...directFields,
      candidate: { ...data.candidate, ...candidateFields },
    });
    await saveToDatabase(nextData);
    setData(nextData);
    const previousFiles = applicationFiles.filter(
      (existing) =>
        existing.file_type === category &&
        existing.id !== uploadPayload.file.id,
    );
    await Promise.allSettled(
      previousFiles.map((existing) =>
        apiFetch(`/api/applications/${application.id}/files/${existing.id}`, {
          method: "DELETE",
        }),
      ),
    );
    await loadSourceFile();
  };
  const uploadSignedSection = async (section, file) => {
    if (!file) return;
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) {
      window.alert("签字盖章文件仅支持 PDF、JPG、PNG");
      return;
    }
    const category = `section_signed:${awardProfile.code}:${section.key}`;
    const body = new FormData();
    body.append("file", file);
    body.append("category", category);
    const response = await apiFetch(
      `/api/applications/${application.id}/files`,
      { method: "POST", body },
    );
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      window.alert(payload.message || "签章文件上传失败");
      return;
    }
    const previousFiles = applicationFiles.filter(
      (existing) =>
        existing.file_type === category && existing.id !== payload.file.id,
    );
    await Promise.allSettled(
      previousFiles.map((existing) =>
        apiFetch(`/api/applications/${application.id}/files/${existing.id}`, {
          method: "DELETE",
        }),
      ),
    );
    await loadSourceFile();
  };
  const currentSection =
    sections.find((section) => section.key === active) || sections[0];
  const currentContent = () => {
    if (active === "basic")
      return (
        <BasicForm
          data={data}
          setField={setField}
          disciplineRecords={disciplineRecords}
          applicationId={application.id}
        />
      );
    if (awardProfile.code === "achievement") {
      if (active === "honors")
        return (
          <RecordsSection
            number={2}
            title="所获与节能减排相关科技奖励和荣誉称号情况"
            group="awardRecords"
            records={data.awardRecords}
            onChange={(value) => setField("awardRecords", value)}
            fields={achievementRecordFields.honors}
            addLabel="添加奖励或荣誉"
            emptyLabel="暂无奖励或荣誉记录"
          />
        );
      if (active === "publications")
        return (
          <RecordsSection
            number={3}
            title="发表节能减排相关论文和专著情况"
            group="paperRecords"
            records={data.paperRecords}
            onChange={(value) => setField("paperRecords", value)}
            fields={achievementRecordFields.publications}
            showIndex
            addLabel="添加论文或专著"
            emptyLabel="暂无论文或专著记录，代表性成果不超过 10 篇（册）"
          />
        );
      if (active === "achievementIp")
        return (
          <RecordsSection
            number={4}
            title="所获知识产权证书"
            type="ip"
            records={data.ipRecords}
            onChange={(value) => setField("ipRecords", value)}
            fields={achievementRecordFields.achievementIp}
            showIndex
            addLabel="添加知识产权"
            emptyLabel="暂无知识产权记录，代表性知识产权不超过 10 项"
          />
        );
      if (active === "research")
        return (
          <RecordsSection
            number={5}
            title="承担节能减排相关的科研项目情况"
            group="researchRecords"
            records={data.researchRecords}
            onChange={(value) => setField("researchRecords", value)}
            fields={achievementRecordFields.research}
            showIndex
            addLabel="添加科研项目"
            emptyLabel="暂无科研项目记录"
          />
        );
      if (active === "engineering")
        return (
          <RecordsSection
            number={6}
            title="参与节能减排相关的重大工程技术项目情况"
            group="engineeringRecords"
            records={data.engineeringRecords}
            onChange={(value) => setField("engineeringRecords", value)}
            fields={achievementRecordFields.engineering}
            addLabel="添加工程项目"
            emptyLabel="暂无重大工程技术项目记录"
          />
        );
      if (active === "transformation")
        return (
          <LongTextSection
            number={7}
            title="科技成果转化及推广情况"
            description="限 800 字，阐述本人主导或参与的科技成果转化路径、推广范围、转化效果和行业带动作用。"
            fields={[
              {
                key: "transformation",
                label: "科技成果转化及推广情况",
                required: true,
                max: LONG_TEXT_LIMITS.transformation,
              },
            ]}
            data={data}
            setField={setField}
            applicationId={application.id}
          />
        );
      if (active === "attachments")
        return (
          <AttachmentSection
            applicationId={application.id}
            workflowMode={data.workflowMode}
            awardType={data.awardType}
            onFilesChange={setApplicationFiles}
          />
        );
      return (
        <TemplateOnlySection section={currentSection} profile={awardProfile} />
      );
    }
    if (active === "introduction")
      return (
        <LongTextSection
          number={2}
          title="项目简介"
          description={`${awardProfile.code === "invention" ? "申报技术发明奖" : "申报科技进步奖"}填写：项目所属科学技术领域、核心科技内容、关键技术经济指标、促进行业科技进步的核心作用、实际应用推广范围及效果（限 800 个汉字）。`}
          fields={[
            {
              key: "introduction",
              label: "项目简介",
              required: true,
              max: LONG_TEXT_LIMITS.introduction,
            },
          ]}
          data={data}
          setField={setField}
          applicationId={application.id}
        />
      );
    if (active === "details")
      return (
        <LongTextSection
          number={3}
          title="项目详细内容"
          description="严格按模板 1 至 7 项顺序填写；国内外同类技术比较不超过两页。"
          fields={[
            ...awardProfile.detailFields.map(([key, label]) => ({
              key,
              label,
              required: true,
              max: LONG_TEXT_LIMITS[key],
              hint:
                {
                  background: "限 800 字。",
                  technicalContent:
                    "纸面不敷可另增页；系统阐述技术原理、研发过程、核心工艺/方法/算法、技术实现路径和关键配套措施。",
                  innovations:
                    "逐条列明核心创新点，明确创新类型、具体内容及与现有技术的本质区别，突出节能减排领域独特价值；限 800 字。",
                }[key] || "",
            })),
            {
              key: "comparison",
              label: "4．与当前国内外同类技术的比较（不超过两页）",
              required: true,
              hint: "从主要技术参数、节能减排效益、市场竞争力三个维度，对比国内外同类先进技术并明确本项目技术水平定位。",
            },
            {
              key: "application",
              label: "5．应用情况",
              required: true,
              max: LONG_TEXT_LIMITS.application,
              hint: "填写项目应用时间、应用单位数量和范围、实际运行效果、用户反馈、推广前景及已开展的推广措施；限 800 字。",
            },
            {
              key: "economic",
              label: "6．经济效益：各栏目的计算依据",
              max: LONG_TEXT_LIMITS.economic,
              hint: "标准、软科学类项目可不填；金额单位为万元人民币，创收外汇为美元；计算依据限 300 字。",
            },
            {
              key: "social",
              label: "7．社会效益",
              max: LONG_TEXT_LIMITS.social,
              hint: "填写节能减排、环境保护、资源节约、产业升级、就业带动、公共安全、行业标准完善等社会效益；限 300 字。",
            },
          ]}
          data={data}
          setField={setField}
          applicationId={application.id}
          prefixes={{
            economic: (
              <Field label="经济效益数据">
                <EconomicCollection
                  summary={data.economicSummary}
                  records={data.economicRecords || []}
                  onSummaryChange={(value) =>
                    setField("economicSummary", value)
                  }
                  onRecordsChange={(value) =>
                    setField("economicRecords", value)
                  }
                />
              </Field>
            ),
          }}
        />
      );
    if (active === "awards")
      return (
        <RecordsSection
          number={4}
          title="本项目曾获奖励情况"
          records={data.awardRecords}
          onChange={(value) => setField("awardRecords", value)}
        />
      );
    if (active === "ip")
      return (
        <RecordsSection
          number={5}
          title="申请、获得知识产权情况表"
          type="ip"
          records={data.ipRecords}
          onChange={(value) => setField("ipRecords", value)}
          applicationId={application.id}
          directoryLabel="1．知识产权证明目录"
          tableTitle="知识产权证明目录"
          addLabel="添加知识产权"
          supplement={
            <>
              <DirectoryRow label="2．技术评价证明及行业审批文件目录">
                <TechnicalEvaluationTable
                  value={data.technicalEvaluation || ""}
                  onChange={(value) => setField("technicalEvaluation", value)}
                />
              </DirectoryRow>
              <DirectoryRow label="3．应用单位目录">
                <ApplicationUnitsTable
                  records={data.applicationUnits || []}
                  onChange={(value) => setField("applicationUnits", value)}
                />
              </DirectoryRow>
            </>
          }
        />
      );
    if (active === "people")
      return (
        <EntityEditor
          entityType="people"
          number={6}
          value={data.people}
          onChange={(value) => setField("people", value)}
          renderCustomField={({ field, record, index, update }) =>
            field.key === "contribution" ? (
              <div className="person-contribution">
                <div className="person-contribution-label">
                  对本项目主要贡献
                </div>
                <RichTextEditor
                  value={record.contribution}
                  onChange={(value) => update("contribution", value)}
                  applicationId={application.id}
                  fieldKey={`person-${record.id || index}-contribution`}
                  label={`${record.name || `第 ${index + 1} 完成人`}对本项目主要贡献`}
                />
              </div>
            ) : null
          }
        />
      );
    if (active === "units")
      return (
        <EntityEditor
          entityType="units"
          number={7}
          value={data.units}
          onChange={(value) => setField("units", value)}
          renderCustomField={({ field, record, index, update }) =>
            field.key === "contribution" ? (
              <div className="person-contribution unit-contribution">
                <div className="person-contribution-label">
                  对本项目技术创新和应用的贡献
                </div>
                <RichTextEditor
                  value={record.contribution}
                  onChange={(value) => update("contribution", value)}
                  applicationId={application.id}
                  fieldKey={`unit-${record.id || index}-contribution`}
                  label={`${record.name || `第 ${index + 1} 完成单位`}对本项目技术创新和应用的贡献`}
                />
                <CharacterCount
                  value={record.contribution}
                  max={LONG_TEXT_LIMITS.unitContribution}
                />
              </div>
            ) : null
          }
        />
      );
    if (active === "attachments")
      return (
        <AttachmentSection
          applicationId={application.id}
          workflowMode={data.workflowMode}
          awardType={data.awardType}
          onFilesChange={setApplicationFiles}
        />
      );
    return (
      <TemplateOnlySection section={currentSection} profile={awardProfile} />
    );
  };
  if (showPreview)
    return (
      <PreviewDialog
        data={data}
        applicationId={application.id}
        sourceFile={sourceFile}
        disciplineRecords={disciplineRecords}
        onClose={() => setShowPreview(false)}
      />
    );
  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="mobile-menu icon-button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-expanded={sidebarOpen}
          aria-label={sidebarOpen ? "关闭导航" : "打开导航"}
        >
          <Menu size={20} />
        </button>
        <div className="brand">
          <span className="brand-mark">
            <span>节</span>
          </span>
          <span>
            <b>中国节能协会创新奖</b>
            <small>申报与评审系统</small>
          </span>
        </div>
        <div className="topbar-center">
          <span className="draft-title">
            {data.projectName || "未命名申报项目"}
          </span>
          <span className="save-state">
            <Check size={14} />
            {saveState === "saving"
              ? "正在保存…"
              : saveState === "dirty"
                ? "有修改待保存"
                : saveState === "error"
                  ? "保存失败，已保留本地草稿"
                  : savedAt
                    ? `${savedAt} 已自动保存`
                    : "草稿已载入"}
          </span>
        </div>
        <div className="top-actions">
          <button
            className="secondary-button home-button"
            onClick={async () => {
              try {
                await saveToDatabase();
              } finally {
                onHome();
              }
            }}
          >
            <Home size={17} />
            项目中心
          </button>
          {awardProfile.mode === "project" && (
            <button
              className="secondary-button import-button"
              onClick={() => setShowImport(true)}
            >
              <ScanText size={17} />
              PDF 智能导入
            </button>
          )}
          {sourceFile && (
            <a
              className="secondary-button final-export-top"
              href={`/api/applications/${application.id}/files/${sourceFile.id}/download`}
            >
              <FileDown size={17} />
              导出最终版
            </a>
          )}
          <button
            className="icon-button"
            title="保存草稿"
            onClick={() => saveToDatabase()}
          >
            <Save size={18} />
          </button>
          <button className="primary-button" onClick={openPreview}>
            <Eye size={17} />
            生成预览
          </button>
        </div>
      </header>
      <div className="deadline-bar">
        <Info size={15} />
        <span>
          2026
          年度申报材料请确保内容真实、完整；提交前请完成全部必填项并核对预览文件。
        </span>
        <button type="button">
          <CircleHelp size={14} />
          填报帮助
        </button>
      </div>
      <div className="body-shell">
        <aside
          className={sidebarOpen ? "sidebar open" : "sidebar"}
          aria-label="申报内容导航"
        >
          <div className="project-summary">
            <span className="summary-icon">
              <FileText size={20} />
            </span>
            <div>
              <b>{data.awardType}</b>
              <small>{data.year} 年度申报</small>
            </div>
          </div>
          <div className="progress-box">
            <div>
              <span>材料完整度</span>
              <b>{completion}%</b>
            </div>
            <div className="progress-track">
              <i style={{ width: `${completion}%` }} />
            </div>
            <small>
              {completeCount} / {sections.length} 个章节已完成
            </small>
          </div>
          <nav>
            <p>申报内容</p>
            {sections.map(({ key, label, number }) => (
              <button
                type="button"
                key={key}
                className={active === key ? "active" : ""}
                onClick={() => {
                  setActive(key);
                  setSidebarOpen(false);
                }}
              >
                <span>{number}</span>
                <b>{label}</b>
                {sectionCompletion[key] && (
                  <i className="nav-done">
                    <Check size={12} />
                  </i>
                )}
              </button>
            ))}
          </nav>
          <div className="reference-links">
            <p>参考材料</p>
            <a
              href="/materials/附件2.中国节能协会创新奖申报书.doc"
              target="_blank"
            >
              <BookOpen size={16} />
              <span>申报书模板</span>
            </a>
            <a
              href="/materials/附件3.中国节能协会创新奖申报书填写说明-1.pdf"
              target="_blank"
            >
              <CircleHelp size={16} />
              <span>填写说明</span>
            </a>
            <a
              href="/materials/附件1.中国节能协会创新奖奖励办法（2026修订版）-1.pdf"
              target="_blank"
            >
              <ShieldCheck size={16} />
              <span>奖励办法</span>
            </a>
          </div>
        </aside>
        <main className="content">
          <div className="content-topline">
            <div className="breadcrumb">
              <FolderOpen size={16} />
              <span>申报内容</span>
              <ChevronRight size={14} />
              <b>{currentSection?.label}</b>
            </div>
            <span className="form-version">表单版本 2026.1</span>
          </div>
          <SectionTemplateBar
            applicationId={application.id}
            section={currentSection}
            uploadedFile={applicationFiles.find(
              (file) =>
                file.file_type ===
                  `section_word:${awardProfile.code}:${currentSection.key}` ||
                file.file_type ===
                  `section_signed:${awardProfile.code}:${currentSection.key}`,
            )}
            onUpload={(file) =>
              currentSection.uploadMode === "signed"
                ? uploadSignedSection(currentSection, file)
                : setWordImportSection(currentSection)
            }
          />
          {currentContent()}
          <div className="bottom-actions">
            <button className="secondary-button" onClick={openPreview}>
              <Eye size={17} />
              预览当前申报书
            </button>
            <button className="primary-button" onClick={continueFromSection}>
              {active === sections.at(-1)?.key
                ? "提交形式审查"
                : "保存并进入下一项"}
              {active === sections.at(-1)?.key ? (
                <ShieldCheck size={17} />
              ) : (
                <ChevronRight size={17} />
              )}
            </button>
          </div>
        </main>
      </div>
      {showImport && awardProfile.mode === "project" && (
        <ImportDialog
          applicationId={application.id}
          onClose={() => setShowImport(false)}
          onApply={applyImport}
        />
      )}
      {wordImportSection && (
        <WordImportDialog
          applicationId={application.id}
          currentData={data}
          section={wordImportSection}
          onClose={() => setWordImportSection(null)}
          onApply={applyWordImport}
        />
      )}
    </div>
  );
}

function App() {
  const [user, setUser] = useState(undefined);
  const [currentApplication, setCurrentApplication] = useState(null);
  const [route, setRoute] = useState(window.location.hash || "#/home");
  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((payload) => setUser(payload.user || null))
      .catch(() => setUser(null));
    const syncRoute = () => setRoute(window.location.hash || "#/home");
    const expire = () => setUser(null);
    window.addEventListener("hashchange", syncRoute);
    window.addEventListener("auth-expired", expire);
    return () => {
      window.removeEventListener("hashchange", syncRoute);
      window.removeEventListener("auth-expired", expire);
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    const match = route.match(/^#\/applications\/(\d+)/);
    if (!match) {
      setCurrentApplication(null);
      return;
    }
    const id = Number(match[1]);
    if (currentApplication?.id === id) return;
    apiFetch(`/api/applications/${id}`)
      .then((response) => response.json())
      .then((payload) => {
        if (payload.ok) setCurrentApplication(payload.application);
        else window.location.hash = "/home";
      });
  }, [route, user]);
  const openApplication = (application) => {
    setCurrentApplication(application);
    window.location.hash = `/applications/${application.id}`;
  };
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setCurrentApplication(null);
    setUser(null);
    window.location.hash = "/login";
  };
  if (user === undefined)
    return (
      <div className="app-loading">
        <LoaderCircle className="spin" size={28} />
        正在载入申报系统…
      </div>
    );
  if (!user)
    return (
      <AuthScreen
        onAuthenticated={(nextUser) => {
          setUser(nextUser);
          window.location.hash = "/home";
        }}
      />
    );
  return currentApplication ? (
    <EditorApp
      key={currentApplication.id}
      application={currentApplication}
      onHome={() => {
        setCurrentApplication(null);
        window.location.hash = "/home";
      }}
    />
  ) : (
    <Dashboard onOpen={openApplication} user={user} onLogout={logout} />
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
