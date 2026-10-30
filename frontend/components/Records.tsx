"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./Records.module.css";
type Row = Record<string, any>;
// Format for display only. Preserve the original API values in detail views.
function metric(value: unknown, digits: number) {
  if (
    value === null ||
    value === undefined ||
    (typeof value !== "number" && typeof value !== "string") ||
    String(value).trim() === ""
  )
    return "—";
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits }).format(
        number,
      )
    : "—";
}
function badge(value: string) {
  return `${styles.badge} ${styles[value?.toLowerCase()] || ""}`;
}

async function request(path: string, method = "GET", body?: unknown) {
  const r = await fetch("/api/backend/" + path, {
    method,
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || data.error || "Yêu cầu thất bại.");
  return data;
}
function label(s: string) {
  return (
    (
      {
        OPEN: "Mở",
        ACKNOWLEDGED: "Đã xác nhận",
        RESOLVED: "Đã xử lý",
        DRAFT: "Bản nháp",
        APPROVED: "Đã duyệt",
        REJECTED: "Đã từ chối",
        INFO: "Thông tin",
        WARNING: "Cảnh báo",
        CRITICAL: "Nghiêm trọng",
        DAILY: "Báo cáo ngày",
        WEEKLY: "Báo cáo tuần",
      } as Record<string, string>
    )[s] || s
  );
}
function incidentTitle(row: Row) {
  const title = String(row.title || "");
  if (!title.includes("�") && !title.includes("?")) return title;
  const room = row.room_code || "phòng học";
  const titles: Record<string, string> = {
    HIGH_TEMPERATURE: `Nhiệt độ phòng ${room} cao`,
    HIGH_HUMIDITY: `Độ ẩm phòng ${room} cao`,
    HIGH_CO2: `Nồng độ CO₂ phòng ${room} cao`,
    ENERGY_WASTE: `Lãng phí điện tại phòng ${room}`,
    AFTER_HOURS_DOOR: `Cửa phòng ${room} mở ngoài giờ`,
    DEVICE_OFFLINE: `Thiết bị tại phòng ${room} mất kết nối`,
    COMMAND_FAILURE: `Lỗi lệnh thiết bị tại phòng ${room}`,
    INVALID_PAYLOAD: `Dữ liệu gửi lên không hợp lệ tại phòng ${room}`,
    SENSOR_ANOMALY: `Cảm biến tại phòng ${room} có dữ liệu bất thường`,
  };
  return titles[row.type] || `Sự cố tại phòng ${room}`;
}
function repairMojibake(value: string) {
  if (!/[ÃÂáºá»]/.test(value)) return value;
  const cp1252: Record<string, number> = {
    "€": 0x80,
    "‚": 0x82,
    ƒ: 0x83,
    "„": 0x84,
    "…": 0x85,
    "†": 0x86,
    "‡": 0x87,
    ˆ: 0x88,
    "‰": 0x89,
    Š: 0x8a,
    "‹": 0x8b,
    Œ: 0x8c,
    Ž: 0x8e,
    "‘": 0x91,
    "’": 0x92,
    "“": 0x93,
    "”": 0x94,
    "•": 0x95,
    "–": 0x96,
    "—": 0x97,
    "˜": 0x98,
    "™": 0x99,
    š: 0x9a,
    "›": 0x9b,
    œ: 0x9c,
    ž: 0x9e,
    Ÿ: 0x9f,
  };
  try {
    const codes = Array.from(value, (char) => {
      const code = char.codePointAt(0) ?? 0;
      return code <= 255 ? code : (cp1252[char] ?? -1);
    });
    if (codes.some((code) => code < 0)) return value;
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(codes),
    );
  } catch {
    return value;
  }
}
function reportSummary(row: Row) {
  if (row.metrics?.generated_by !== "WF12_RULES")
    return repairMojibake(String(row.summary || ""));
  const metrics = row.metrics || {};
  const recommendations = Array.isArray(metrics.recommendations)
    ? metrics.recommendations
    : [];
  if (metrics.data_quality === "INSUFFICIENT")
    return `Đề xuất tối ưu tuần cho ${row.room_code || "phòng học"}. Dữ liệu chưa đủ bao phủ (${metrics.active_days ?? 0}/4 ngày hoạt động, ${metrics.telemetry_count ?? 0}/100 mẫu); hãy thu thập thêm dữ liệu trước khi thay đổi chính sách.`;
  return `Đã tạo ${recommendations.length} đề xuất tối ưu tuần dựa trên số liệu và sự cố. Chưa có chính sách nào được thay đổi.`;
}
function reportDetails(row: Row) {
  const metrics = row.metrics || {};
  if (metrics.generated_by !== "WF12_RULES")
    return { ...metrics, summary: reportSummary(row) };
  const recommendations = (metrics.recommendations || []).map((item: Row) => {
    if (metrics.data_quality === "INSUFFICIENT")
      return {
        ...item,
        action: "Thu thập thêm dữ liệu telemetry trước khi thay đổi chính sách",
        reason:
          "Dữ liệu tuần chưa đạt mức tối thiểu để tối ưu. Giữ nguyên chính sách hiện tại cho đến khi có ít nhất 4 ngày hoạt động và 100 mẫu.",
      };
    const translations: Record<string, [string, string]> = {
      "Review cooling schedule and room occupancy": [
        "Rà soát lịch làm mát và thời gian sử dụng phòng",
        "Nhiệt độ trung bình tuần đang gần ngưỡng làm mát hiện tại.",
      ],
      "Inspect ventilation and moisture sources": [
        "Kiểm tra thông gió và nguồn gây ẩm",
        "Độ ẩm trung bình tuần đang gần ngưỡng độ ẩm hiện tại.",
      ],
      "Review ventilation during occupied periods": [
        "Rà soát thông gió trong thời gian có người",
        "CO₂ trung bình tuần đang gần ngưỡng thông gió hiện tại.",
      ],
      "Keep the current policy and review next week": [
        "Giữ nguyên chính sách và xem lại vào tuần tới",
        "Số liệu hiện có chưa cho thấy cần thay đổi chính sách.",
      ],
    };
    const translated = translations[item.action];
    return translated
      ? { ...item, action: translated[0], reason: translated[1] }
      : item;
  });
  return { ...metrics, recommendations, summary: reportSummary(row) };
}
export default function Records({ kind }: { kind: "incidents" | "reports" }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<Row[]>([]),
    [rooms, setRooms] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Row | null>(null);
  const [room, setRoom] = useState(""),
    [status, setStatus] = useState(""),
    [severity, setSeverity] = useState(""),
    [type, setType] = useState(""),
    [assigned, setAssigned] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [message, setMessage] = useState(""),
    [notifications, setNotifications] = useState<Row[]>([]);
  const load = useCallback(async () => {
    try {
      setError("");
      const params = new URLSearchParams(
        Object.entries({
          room,
          status,
          severity,
          type,
          assigned_to: assigned,
          from,
          to,
        }).filter(([, v]) => !!v) as [string, string][],
      );
      const [items, roomItems, ...extra] = await Promise.all([
        request(kind + (params.size ? "?" + params.toString() : "")),
        request("rooms"),
        ...(kind === "incidents" ? [request("notifications")] : []),
      ]);
      setRows(items);
      setRooms(roomItems);
      if (extra[0]) setNotifications(extra[0]);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [kind, room, status, severity, type, assigned, from, to]);
  useEffect(() => {
    void load();
  }, [load]);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage("Đã lưu thay đổi.");
      await load();
      if (selected?.id) {
        const fresh = await request(`${kind}/${selected.id}`);
        setSelected(fresh);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!selected) return;
    const dialog = dialogRef.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [selected?.id]);
  const counts = useMemo(
    () => ({
      open: rows.filter((r) => r.status === "OPEN").length,
      draft: rows.filter((r) => r.status === "DRAFT").length,
      critical: rows.filter((r) => r.severity === "CRITICAL").length,
    }),
    [rows],
  );
  const title = kind === "incidents" ? "Quản lý sự cố" : "Báo cáo hệ thống";
  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <div>
          <div className="eyebrow">
            {kind === "incidents"
              ? "THEO DÕI PHÒNG HỌC"
              : "THỐNG KÊ & TỔNG HỢP"}
          </div>
          <h1>{title}</h1>
          <p>
            {kind === "incidents"
              ? "Theo dõi, xác nhận, phân công và xử lý sự cố theo vòng đời."
              : "Tổng hợp dữ liệu theo ngày, xem chỉ số và duyệt đề xuất tối ưu tuần."}
          </p>
        </div>
        <button className={styles.button} onClick={() => void load()}>
          Làm mới
        </button>
      </div>
      {error && !selected && (
        <div role="alert" className={`${styles.notice} ${styles.error}`}>
          {error}
        </div>
      )}
      {message && !selected && (
        <div role="status" className={`${styles.notice} ${styles.success}`}>
          {message}
        </div>
      )}
      <div className={styles.stats}>
        {(kind === "incidents"
          ? [
              ["Đang mở", counts.open],
              ["Nghiêm trọng", counts.critical],
              ["Tổng sự cố", rows.length],
            ]
          : [
              ["Bản nháp", counts.draft],
              ["Đề xuất tuần", rows.filter((r) => r.type === "WEEKLY").length],
              ["Báo cáo", rows.length],
            ]
        ).map(([k, v]) => (
          <div key={String(k)} className={styles.stat}>
            <small>{k}</small>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
      {kind === "reports" && (
        <section className={styles.card}>
          <h2 style={{ marginTop: 0 }}>Tạo báo cáo</h2>
          <div className={styles.actions}>
            <select
              aria-label="Phòng"
              className={styles.field}
              value={room}
              onChange={(e) => setRoom(e.target.value)}
            >
              <option value="">Chọn phòng</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.code}>
                  {r.code} · {r.name}
                </option>
              ))}
            </select>
            <button
              className={`${styles.button} ${styles.primary}`}
              disabled={busy || !room}
              onClick={() =>
                void act(async () => {
                  await request(
                    `reports/daily/${encodeURIComponent(room)}`,
                    "POST",
                    {},
                  );
                })
              }
            >
              Tổng hợp hôm nay
            </button>
            <button
              className={styles.button}
              disabled={busy || !room}
              onClick={() =>
                void act(async () => {
                  const ctx = await request(
                    `reports/weekly/context/${encodeURIComponent(room)}`,
                  );
                  if (!ctx.eligible)
                    throw new Error(
                      "Chưa đủ dữ liệu tuần: cần ít nhất 4 ngày và 100 mẫu telemetry.",
                    );
                  const tips = [];
                  if (Number(ctx.metrics.avg_co2_ppm) > 1000)
                    tips.push({
                      action: "Tăng thông gió theo giờ có CO₂ cao",
                      evidence: { avg_co2_ppm: ctx.metrics.avg_co2_ppm },
                    });
                  if (Number(ctx.metrics.avg_temperature) > 29)
                    tips.push({
                      action: "Tối ưu lịch quạt theo nhiệt độ và occupancy",
                      evidence: {
                        avg_temperature: ctx.metrics.avg_temperature,
                      },
                    });
                  if (!tips.length)
                    tips.push({
                      action:
                        "Duy trì policy hiện tại và theo dõi thêm một tuần",
                      evidence: ctx.metrics,
                    });
                  await request(
                    `reports/weekly/${encodeURIComponent(room)}`,
                    "POST",
                    {
                      period_start: ctx.period_start,
                      period_end: ctx.period_end,
                      metrics: {
                        ...ctx.metrics,
                        policy: ctx.policy,
                        incidents: ctx.incidents,
                        recommendations: tips,
                        generated_by: "RULE_FALLBACK",
                      },
                      summary: `Đề xuất tối ưu tuần cho ${room}; kiểm tra dữ liệu và policy trước khi áp dụng.`,
                    },
                  );
                })
              }
            >
              Tạo bản nháp tối ưu tuần
            </button>
          </div>
          <p className={styles.hint}>
            {room
              ? "Bản nháp tuần cần ít nhất 4 ngày hoạt động và 100 mẫu cảm biến. Đề xuất cần được duyệt và không tự thay đổi cấu hình phòng."
              : "Chọn một phòng để tạo báo cáo ngày hoặc bản nháp đề xuất tuần."}
          </p>
        </section>
      )}
      {kind === "reports" && rows[0]?.metrics && (
        <section className={styles.card}>
          <h2>
            Chỉ số gần nhất · {rows[0].room_code} · {label(rows[0].type)}
          </h2>
          <div className={styles.metrics}>
            {[
              {
                name: "Năng lượng ước tính",
                unit: "kWh",
                value: rows[0].metrics.estimated_kwh,
                digits: 3,
              },
              {
                name: "Nhiệt độ trung bình",
                unit: "°C",
                value: rows[0].metrics.avg_temperature,
                digits: 1,
              },
              {
                name: "Độ ẩm trung bình",
                unit: "%",
                value: rows[0].metrics.avg_humidity,
                digits: 1,
              },
              {
                name: "CO₂ trung bình",
                unit: "ppm",
                value: rows[0].metrics.avg_co2_ppm,
                digits: 0,
              },
            ].map((item) => (
              <div key={item.name} className={styles.metric}>
                <span>{item.name}</span>
                <div>
                  <strong>{metric(item.value, item.digits)}</strong>
                  <small>{item.unit}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {kind === "incidents" && notifications.some((n) => !n.read_at) && (
        <div className={styles.notifications}>
          Thông báo mới: {notifications.filter((n) => !n.read_at).length}
          <div className={styles.notificationList}>
            {notifications
              .filter((n) => !n.read_at)
              .slice(0, 3)
              .map((n) => (
                <div key={n.id} className={styles.notificationRow}>
                  <span>
                    {n.title} · {n.body}
                  </span>
                  <button
                    className={`${styles.button} ${styles.small}`}
                    onClick={() =>
                      void act(() =>
                        request(`notifications/${n.id}/read`, "PATCH", {}),
                      )
                    }
                    disabled={busy}
                  >
                    Đánh dấu đã đọc
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
      <section className={styles.card}>
        <div className={styles.filters}>
          <select
            aria-label="Lọc phòng"
            className={styles.field}
            value={room}
            onChange={(e) => setRoom(e.target.value)}
          >
            <option value="">Tất cả phòng</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.code}>
                {r.code}
              </option>
            ))}
          </select>
          {kind === "incidents" ? (
            <>
              <select
                aria-label="Mức độ"
                className={styles.field}
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                <option value="">Mọi mức độ</option>
                {["INFO", "WARNING", "CRITICAL"].map((x) => (
                  <option key={x} value={x}>
                    {label(x)}
                  </option>
                ))}
              </select>
              <select
                aria-label="Trạng thái"
                className={styles.field}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Mọi trạng thái</option>
                {["OPEN", "ACKNOWLEDGED", "RESOLVED"].map((x) => (
                  <option key={x} value={x}>
                    {label(x)}
                  </option>
                ))}
              </select>
              <input
                aria-label="Lọc người phụ trách"
                className={styles.field}
                placeholder="Người phụ trách"
                value={assigned}
                onChange={(e) => setAssigned(e.target.value)}
              />
            </>
          ) : (
            <>
              <select
                aria-label="Loại báo cáo"
                className={styles.field}
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">Mọi kỳ</option>
                <option value="DAILY">Ngày</option>
                <option value="WEEKLY">Tuần</option>
              </select>
              <select
                aria-label="Trạng thái"
                className={styles.field}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Mọi trạng thái</option>
                {["DRAFT", "APPROVED", "REJECTED"].map((x) => (
                  <option key={x} value={x}>
                    {label(x)}
                  </option>
                ))}
              </select>
              <label className={styles.dateField}>
                Từ{" "}
                <input
                  aria-label="Từ ngày"
                  type="date"
                  className={styles.field}
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className={styles.dateField}>
                Đến{" "}
                <input
                  aria-label="Đến ngày"
                  type="date"
                  className={styles.field}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
            </>
          )}
        </div>
        {!rows.length ? (
          <div className="empty">Chưa có dữ liệu phù hợp.</div>
        ) : (
          rows.map((row) => (
            <article key={row.id} className={styles.row}>
              <div className={styles.rowContent}>
                <strong>
                  {kind === "incidents"
                    ? incidentTitle(row)
                    : `${row.type === "DAILY" ? "Báo cáo ngày" : "Tối ưu tuần"} · ${row.room_code}`}
                </strong>
                <div className={styles.meta}>
                  {row.room_code || "—"} · {row.device_code || "Toàn phòng"} ·{" "}
                  {new Date(row.last_seen || row.period_start).toLocaleString(
                    "vi-VN",
                  )}
                </div>
                <div className={styles.meta}>
                  {kind === "incidents"
                    ? `${row.type} · ${row.count} lần · ${row.assigned_to || "Chưa phân công"}`
                    : reportSummary(row)}
                </div>
              </div>
              <div className={styles.badges}>
                {kind === "incidents" && (
                  <span className={badge(row.severity)}>
                    {label(row.severity)}
                  </span>
                )}
                <span className={badge(row.status)}>{label(row.status)}</span>
              </div>
              <button
                className={`${styles.button} ${styles.small}`}
                onClick={() =>
                  void request(`${kind}/${row.id}`)
                    .then(setSelected)
                    .catch((e) => setError(e.message))
                }
                aria-label={`Chi tiết ${kind === "incidents" ? incidentTitle(row) : `${label(row.type)} · ${row.room_code}`}`}
              >
                Chi tiết
              </button>
            </article>
          ))
        )}
      </section>
      {selected && (
        <dialog
          ref={dialogRef}
          aria-labelledby="record-detail-title"
          className={styles.dialog}
          onCancel={() => setSelected(null)}
        >
          <section>
            <div className={styles.dialogHeading}>
              <h2 id="record-detail-title">
                {kind === "incidents"
                  ? incidentTitle(selected)
                  : `${label(selected.type)} · ${selected.room_code}`}
              </h2>
              <button
                className={styles.button}
                onClick={() => setSelected(null)}
              >
                Đóng
              </button>
            </div>
            {error && (
              <div role="alert" className={`${styles.notice} ${styles.error}`}>
                {error}
              </div>
            )}
            {message && (
              <div role="status" className={`${styles.notice} ${styles.success}`}>
                {message}
              </div>
            )}
            <pre className={styles.details}>
              {JSON.stringify(
                kind === "incidents"
                  ? {
                      ...selected,
                      details: selected.details,
                      timeline: selected.timeline,
                    }
                  : {
                      ...selected,
                      summary: reportSummary(selected),
                      metrics: reportDetails(selected),
                    },
                null,
                2,
              )}
            </pre>
            {kind === "incidents" ? (
              <div className={styles.actions}>
                <input
                  aria-label="Người phụ trách"
                  placeholder="Email / tên người phụ trách"
                  defaultValue={selected.assigned_to || ""}
                  className={styles.field}
                  id="incident-owner"
                />
                <button
                  className={styles.button}
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const assigned_to = (
                        document.getElementById(
                          "incident-owner",
                        ) as HTMLInputElement
                      ).value;
                      await request(`incidents/${selected.id}`, "PATCH", {
                        assigned_to,
                      });
                    })
                  }
                >
                  Phân công
                </button>
                {selected.status === "OPEN" && (
                  <button
                    className={styles.button}
                    disabled={busy}
                    onClick={() =>
                      void act(() =>
                        request(`incidents/${selected.id}`, "PATCH", {
                          status: "ACKNOWLEDGED",
                        }),
                      )
                    }
                  >
                    Xác nhận
                  </button>
                )}
                {selected.status !== "RESOLVED" && (
                  <button
                    className={`${styles.button} ${styles.primary}`}
                    disabled={busy}
                    onClick={() =>
                      void act(() =>
                        request(`incidents/${selected.id}`, "PATCH", {
                          status: "RESOLVED",
                        }),
                      )
                    }
                  >
                    Đánh dấu đã xử lý
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.actions}>
                {selected.type === "WEEKLY" && selected.status === "DRAFT" && (
                  <>
                    <button
                      className={`${styles.button} ${styles.primary}`}
                      disabled={busy}
                      onClick={() =>
                        void act(() =>
                          request(`reports/${selected.id}`, "PATCH", {
                            status: "APPROVED",
                          }),
                        )
                      }
                    >
                      Duyệt đề xuất
                    </button>
                    <button
                      className={styles.button}
                      disabled={busy}
                      onClick={() =>
                        void act(() =>
                          request(`reports/${selected.id}`, "PATCH", {
                            status: "REJECTED",
                          }),
                        )
                      }
                    >
                      Từ chối
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
        </dialog>
      )}
    </div>
  );
}
