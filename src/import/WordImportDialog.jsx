import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  FileInput,
  FileText,
  LoaderCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import { richTextToPlain, sanitizeRichText } from "../editor/index.jsx";
import { WORD_IMPORT_GUIDANCE } from "./word-guidance.mjs";
import {
  referencedWordImages,
  replaceWordImageSources,
} from "./word-images.mjs";
import "./word-guidance.css";

const RICH_FIELDS = new Set([
  "introduction",
  "background",
  "technicalContent",
  "innovations",
  "comparison",
  "application",
  "economic",
  "social",
  "technicalEvaluation",
  "recommendation",
  "transformation",
  "workSummary",
  "resume",
]);
const MAX_WORD_FILE_BYTES = 20 * 1024 * 1024;

function displayValue(value) {
  if (Array.isArray(value))
    return value
      .map((item) => item?.name || item)
      .filter(Boolean)
      .join("、");
  if (value && typeof value === "object") return JSON.stringify(value);
  return richTextToPlain(String(value || ""));
}

function valueAt(data, key) {
  return String(key || "")
    .split(".")
    .reduce((value, part) => value?.[part], data);
}

function mergeRecords(currentRecords, importedRecords) {
  const records = [
    ...(Array.isArray(currentRecords) ? currentRecords : []),
    ...(Array.isArray(importedRecords) ? importedRecords : []),
  ];
  const seen = new Set();
  return records
    .filter((record) => {
      const identity = [
        record?.name,
        record?.gender,
        record?.workUnit,
        record?.location,
      ]
        .map((value) => String(value || "").replace(/\s+/g, ""))
        .join("|");
      if (!identity.replace(/\|/g, "")) return false;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
    .map((record, index) => ({ ...record, rank: String(index + 1) }));
}

async function apiFetch(url, options) {
  const response = await fetch(url, options);
  if (response.status === 401) window.dispatchEvent(new Event("auth-expired"));
  return response;
}

async function readJsonResponse(response) {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    if (/^\s*</.test(body)) {
      throw new Error(
        "Word 导入服务未启动或当前服务未更新，请重启后端 server.mjs 后重试",
      );
    }
    throw new Error("Word 导入服务返回了无效响应，请稍后重试");
  }
}

function imageAssetToFile(asset) {
  const binary = window.atob(String(asset.base64 || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return new File([bytes], asset.fileName, { type: asset.contentType });
}

async function deleteUploadedWordImages(applicationId, fileIds) {
  await Promise.allSettled(
    fileIds.map((fileId) =>
      apiFetch(`/api/applications/${applicationId}/files/${fileId}`, {
        method: "DELETE",
      }),
    ),
  );
}

async function uploadSelectedWordImages(
  applicationId,
  selectedCandidates,
  images,
) {
  const assets = referencedWordImages(selectedCandidates, images);
  const replacements = new Map();
  const fileIds = [];
  try {
    for (const asset of assets) {
      const body = new FormData();
      body.append("file", imageAssetToFile(asset));
      body.append("category", "content_image:word-import");
      const response = await apiFetch(
        `/api/applications/${applicationId}/files`,
        { method: "POST", body },
      );
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload.ok)
        throw new Error(payload.message || "Word 图片上传失败");
      fileIds.push(payload.file.id);
      replacements.set(
        asset.placeholder,
        `/api/applications/${applicationId}/files/${payload.file.id}/download?inline=1`,
      );
    }
    return { replacements, fileIds };
  } catch (error) {
    await deleteUploadedWordImages(applicationId, fileIds);
    throw error;
  }
}

export function WordImportDialog({
  applicationId,
  currentData,
  section,
  onClose,
  onApply,
}) {
  const inputRef = useRef(null);
  const requestControllerRef = useRef(null);
  const unmountedRef = useRef(false);
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [selectedFields, setSelectedFields] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState("");

  useEffect(
    () => () => {
      unmountedRef.current = true;
      requestControllerRef.current?.abort();
    },
    [],
  );

  const recognized = useMemo(() => {
    const candidates = result?.recognized || [];
    if (!section?.allowedFieldKeys?.length) return [];
    return candidates.filter((candidate) =>
      section.allowedFieldKeys.includes(candidate.key),
    );
  }, [result, section]);
  const selectedCandidates = useMemo(
    () =>
      recognized.filter((candidate) => selectedFields.includes(candidate.key)),
    [recognized, selectedFields],
  );

  const chooseFile = async (file) => {
    if (!file) return;
    if (!/\.docx?$/i.test(file.name)) {
      setError("请选择 .doc 或 .docx 文件");
      setStatus("error");
      return;
    }
    if (file.size > MAX_WORD_FILE_BYTES) {
      setError("Word 文件大小不能超过 20 MB");
      setStatus("error");
      return;
    }
    setStatus("parsing");
    setError("");
    setResult(null);
    setSelectedFile(file);
    const controller = new AbortController();
    requestControllerRef.current = controller;
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("applicationId", String(applicationId));
      body.append("sectionKey", section?.key || "");
      const response = await apiFetch("/api/word-import", {
        method: "POST",
        body,
        signal: controller.signal,
      });
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload.ok)
        throw new Error(payload.message || "Word 文档解析失败");
      setResult(payload);
      const sectionCandidates = (payload.recognized || []).filter((candidate) =>
        section?.allowedFieldKeys?.includes(candidate.key),
      );
      // Chapter uploads are the source of truth for recognized fields.
      const defaults = sectionCandidates.map((candidate) => candidate.key);
      setSelectedFields(defaults);
      const matched = sectionCandidates.length;
      const supported = section?.allowedFieldKeys?.length || 0;
      setStatus(
        matched === 0
          ? "no-match"
          : matched < supported
            ? "partial-match"
            : "review",
      );
    } catch (caught) {
      if (caught.name === "AbortError") {
        if (!unmountedRef.current) {
          setError("");
          setStatus("idle");
        }
        return;
      }
      setError(caught.message);
      setStatus("error");
    } finally {
      if (requestControllerRef.current === controller)
        requestControllerRef.current = null;
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const applySelected = async () => {
    setStatus("applying");
    setError("");
    let uploadedImageIds = [];
    try {
      const uploadedImages = await uploadSelectedWordImages(
        applicationId,
        selectedCandidates,
        result?.images,
      );
      uploadedImageIds = uploadedImages.fileIds;
      const fields = Object.fromEntries(
        selectedCandidates.map((candidate) => [
          candidate.key,
          ["people", "units"].includes(candidate.key)
            ? mergeRecords(currentData[candidate.key], candidate.value)
            : RICH_FIELDS.has(candidate.key)
              ? sanitizeRichText(
                  replaceWordImageSources(
                    candidate.value,
                    uploadedImages.replacements,
                  ),
                )
              : candidate.value,
        ]),
      );
      await onApply(fields, result, selectedFile);
      setStatus("success");
    } catch (caught) {
      await deleteUploadedWordImages(applicationId, uploadedImageIds);
      setError(caught.message || "候选字段应用失败");
      setStatus("apply-error");
    }
  };

  const cancelOrClose = () => {
    if (status === "parsing") requestControllerRef.current?.abort();
    onClose();
  };
  const retry = () => {
    setResult(null);
    setSelectedFields([]);
    setSelectedFile(null);
    setError("");
    setStatus("idle");
  };

  return (
    <div className="modal-layer">
      <div
        className="dialog import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="word-import-title"
      >
        <div className="dialog-head">
          <div>
            <span className="dialog-icon">
              <FileInput size={19} />
            </span>
            <span>
              <b id="word-import-title">{section?.label || "章节"} Word 上传</b>
              <small>解析 .doc / .docx 内容，仅识别并回填当前章节</small>
            </span>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={cancelOrClose}
            aria-label="关闭"
            disabled={status === "applying"}
          >
            <X size={20} />
          </button>
        </div>

        <div className="dialog-body">
          <div className="word-import-guidance" aria-label="Word 导入填写指引">
            {WORD_IMPORT_GUIDANCE}
          </div>
          {status === "idle" && (
            <button
              className="drop-zone"
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              <FileText size={36} />
              <b>选择本章节已填写的 Word</b>
              <span>支持 .doc、.docx，最大 20 MB；文件会保存在当前章节</span>
            </button>
          )}
          <input
            ref={inputRef}
            hidden
            type="file"
            accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(event) => chooseFile(event.target.files?.[0])}
          />

          {status === "parsing" && (
            <div className="analysis-loading">
              <LoaderCircle className="spin" size={34} />
              <b>正在解析 Word 申报书</b>
              <span>正在识别标题层级、正文段落和表格字段，请稍候。</span>
            </div>
          )}

          {(status === "error" || status === "apply-error") && (
            <div className="error-box">
              <AlertCircle size={20} />
              <span>
                <b>{status === "apply-error" ? "应用未完成" : "解析未完成"}</b>
                {error}
              </span>
              <button
                className="secondary-button"
                type="button"
                onClick={
                  status === "apply-error"
                    ? () =>
                        setStatus(
                          recognized.length <
                            (section?.allowedFieldKeys?.length || 0)
                            ? "partial-match"
                            : "review",
                        )
                    : retry
                }
              >
                {status === "apply-error" ? "返回审阅" : "重新选择"}
              </button>
            </div>
          )}

          {status === "no-match" && (
            <div className="warning-row chapter-file-only">
              <FileText size={20} />
              <span>
                <b>本章没有可自动回填的在线字段</b>
                Word 已读取，可直接保存为本章节文件；现有草稿不会被修改。
              </span>
            </div>
          )}

          {status === "partial-match" && result && (
            <div className="warning-row">
              <AlertCircle size={16} />
              仅匹配到 {recognized.length} /{" "}
              {section?.allowedFieldKeys?.length || 0}{" "}
              个可导入字段；未匹配章节不会被修改，请审阅后选择需要应用的候选项。
            </div>
          )}

          {(status === "review" ||
            status === "partial-match" ||
            status === "applying") &&
            result && (
              <>
                <div className="analysis-summary">
                  <ShieldCheck size={22} />
                  <span>
                    <b>{recognized.length} 个候选字段待审阅</b>
                    <small>
                      {result.fileName} · {result.structure.headingCount} 个标题
                      · {result.structure.paragraphCount} 个段落 ·{" "}
                      {result.structure.tableCount} 个表格
                    </small>
                  </span>
                </div>
                <div className="recognition-list">
                  {recognized.map((candidate) => {
                    const currentValue = displayValue(
                      valueAt(currentData, candidate.key),
                    );
                    const suggestedValue = displayValue(candidate.value);
                    const conflict = Boolean(currentValue.trim());
                    const imageCount = referencedWordImages(
                      [candidate],
                      result.images,
                    ).length;
                    return (
                      <label className="recognition-item" key={candidate.key}>
                        <span className="confidence">
                          {Math.round(candidate.confidence * 100)}%
                        </span>
                        <span>
                          <b>{candidate.field}</b>
                          <small>
                            来源：{candidate.source} ·{" "}
                            {conflict ? "与现值冲突，默认不覆盖" : "当前为空"}
                            {imageCount ? ` · 包含 ${imageCount} 张图片` : ""}
                          </small>
                          <p>
                            <strong>现值：</strong>
                            {currentValue || "（空）"}
                          </p>
                          <p>
                            <strong>建议值：</strong>
                            {suggestedValue}
                          </p>
                        </span>
                        <input
                          type="checkbox"
                          checked={selectedFields.includes(candidate.key)}
                          disabled={status === "applying"}
                          onChange={() =>
                            setSelectedFields((current) =>
                              current.includes(candidate.key)
                                ? current.filter((key) => key !== candidate.key)
                                : [...current, candidate.key],
                            )
                          }
                          aria-label={`应用${candidate.field}`}
                        />
                      </label>
                    );
                  })}
                </div>
                {(result.warnings || []).map((warning) => (
                  <div className="warning-row" key={warning}>
                    <AlertCircle size={16} />
                    {warning}
                  </div>
                ))}
              </>
            )}

          {status === "success" && (
            <div className="analysis-loading">
              <Check size={34} />
              <b>候选字段已应用</b>
              <span>
                {selectedFields.length
                  ? `仅更新了选中的 ${selectedFields.length} 个字段，其余草稿内容保持不变。`
                  : "章节 Word 已保存，现有草稿内容保持不变。"}
              </span>
            </div>
          )}
        </div>

        <div className="dialog-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={cancelOrClose}
            disabled={status === "applying"}
          >
            {status === "parsing"
              ? "取消解析"
              : status === "success"
                ? "完成"
                : "取消"}
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={
              !(
                status === "review" ||
                status === "partial-match" ||
                status === "no-match"
              ) ||
              (status !== "no-match" && selectedFields.length === 0)
            }
            onClick={applySelected}
          >
            {status === "applying" ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Check size={17} />
            )}
            {status === "applying"
              ? "正在应用"
              : selectedFields.length
                ? `应用并保存（${selectedFields.length}）`
                : "保存章节 Word"}
          </button>
        </div>
      </div>
    </div>
  );
}
