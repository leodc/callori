"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCheck,
  CircleHelp,
  LoaderCircle,
  Phone,
  PhoneCall,
  Plus,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Utensils,
  X,
} from "lucide-react";
import {
  buildCallInput,
  categoryLabels,
  fullName,
  needsDates,
  newPlan,
  purposeLabels,
  type CallPlan,
  type Purpose,
} from "@/lib/call-plan";
import { callSchema } from "@/lib/validation";
import {
  callingCountries,
  destinationPhone,
  type CallingCountry,
} from "@/lib/phone";
import { copy, errors } from "@/lib/i18n";
import {
  terminal,
  type Call,
  type Locale,
  type Profile,
  type Readiness,
} from "@/lib/types";

function Field({
  label,
  help,
  optional,
  children,
}: {
  label: string;
  help?: string;
  optional?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {optional && <small>{optional}</small>}
      </span>
      {children}
      {help && <span className="field-help">{help}</span>}
    </label>
  );
}
export default function CallWizard({
  state,
  l,
  onCreated,
}: {
  state: { calls: Call[]; profile: Profile; readiness: Readiness };
  l: Locale;
  onCreated: (call: Call) => void | Promise<void>;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const template = search.get("template") || "appointment";
  const initial = Object.hasOwn(purposeLabels.en, template)
    ? (template as Purpose)
    : "custom";
  const [plan, setPlan] = useState(() => newPlan(initial));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const phoneInput = useRef<HTMLInputElement>(null);
  const key = useRef("");
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const t = copy[l];
  const say = (en: string, es: string) => (l === "es" ? es : en);
  const scheduled = needsDates(plan.purpose);
  const steps = [
    say("The request", "Tu solicitud"),
    say("Who to call", "A quién llamamos"),
    ...(scheduled ? [say("When works?", "Cuándo te viene bien")] : []),
    say("Review & call", "Revisar y llamar"),
  ];
  const last = steps.length - 1;
  const review = step === last;
  const name = fullName(state.profile);
  const callInput = buildCallInput(plan, l);
  const phone = destinationPhone(plan.phone, plan.country);
  const country = callingCountries.find((item) => item.code === plan.country)!;
  const phoneError = phoneTouched && !phone;
  const isoToday = (() => {
    const p = new Intl.DateTimeFormat("en", {
      timeZone: country.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    return ["year", "month", "day"]
      .map((type) => p.find((x) => x.type === type)!.value)
      .join("-");
  })();

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);
  function change<K extends keyof CallPlan>(field: K, value: CallPlan[K]) {
    setPlan((p) => ({ ...p, [field]: value }));
    key.current = "";
    setConsent(false);
    setError("");
  }
  function selectPurpose(purpose: Purpose) {
    setPlan((p) => ({
      ...newPlan(purpose),
      phone: p.phone,
      country: p.country,
      business: p.business,
      language: p.language,
      shareProfile: p.shareProfile,
    }));
    setStep(0);
    setConsent(false);
    key.current = "";
    setError("");
  }
  const dateText = (d: CallPlan["dates"][number]) =>
    `${new Intl.DateTimeFormat(l, { dateStyle: "long" }).format(new Date(d.date + "T12:00:00"))}${d.from ? ` · ${d.from}` : ` · ${say("Any time", "Cualquier hora")}`}${d.to ? ` – ${d.to}` : ""}`;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (step === 1 && !phone) {
      setPhoneTouched(true);
      phoneInput.current?.focus();
      return;
    }
    if (
      step === 0 &&
      ((plan.purpose !== "restaurant" && plan.reason.trim().length < 2) ||
        (plan.purpose === "appointment" && !plan.category))
    ) {
      setError(
        say(
          "Tell us the reason for this request.",
          "Indica el motivo de esta solicitud.",
        ),
      );
      return;
    }
    if (
      scheduled &&
      step === 2 &&
      plan.dates.some(
        (d) =>
          !d.date || d.date < isoToday || (d.from && d.to && d.from >= d.to),
      )
    ) {
      setError(
        say(
          "Choose a future date and an end time after the start time.",
          "Elige una fecha de hoy en adelante y una hora final posterior a la inicial.",
        ),
      );
      return;
    }
    if (!review) {
      setStep((s) => s + 1);
      return;
    }
    if (
      !consent ||
      !state.readiness.ready ||
      state.calls.some((c) => !terminal(c.status))
    )
      return;
    const parsed = callSchema.safeParse(callInput);
    if (!parsed.success) {
      setError(
        say(
          "Check your request and phone number before calling.",
          "Revisa tu solicitud y el teléfono antes de llamar.",
        ),
      );
      return;
    }
    setBusy(true);
    try {
      key.current ||= crypto.randomUUID();
      const response = await fetch("/api/calls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key.current,
        },
        body: JSON.stringify(parsed.data),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "UNKNOWN");
      await onCreated(data);
    } catch (e) {
      setError(errors[(e as Error).message]?.[l === "es" ? 1 : 0] || t.error);
      setBusy(false);
    }
  }
  const titles = [
    plan.purpose === "appointment"
      ? say("What appointment do you need?", "¿Qué cita necesitas?")
      : plan.purpose === "restaurant"
        ? say("A table for…", "Una mesa para…")
        : plan.purpose === "followup"
          ? say(
              "Let’s pick up where you left off.",
              "Retomemos ese asunto pendiente.",
            )
          : plan.purpose === "inquiry"
            ? say("What would you like to know?", "¿Qué quieres saber?")
            : say("Tell us what you need.", "Cuéntanos qué necesitas."),
    say("Who should we call?", "¿A quién llamamos?"),
    ...(scheduled
      ? [say("Let’s find a good time.", "Busquemos un buen momento.")]
      : []),
    say("All set. Take one last look.", "Todo listo. Dale un último vistazo."),
  ];
  return (
    <>
      <Link href="/" className="back-link">
        <ArrowLeft size={16} />
        {t.back}
      </Link>
      <div className="page-heading wizard-heading">
        <div className="eyebrow">
          {say("A LITTLE HELP, STEP BY STEP", "UN POCO DE AYUDA, PASO A PASO")}
        </div>
        <h1>{purposeLabels[l][plan.purpose]}</h1>
        <p>
          {say(
            "A few simple questions. We’ll take care of the conversation.",
            "Unas preguntas sencillas. Nosotros nos encargamos de la conversación.",
          )}
        </p>
      </div>
      <div className="form-layout wizard-layout">
        <form className="form-card wizard-card" onSubmit={submit}>
          <ol
            className="wizard-progress"
            aria-label={say("Call preparation", "Preparación de la llamada")}
          >
            {steps.map((label, i) => (
              <li
                key={label}
                className={i === step ? "current" : i < step ? "done" : ""}
                aria-current={i === step ? "step" : undefined}
              >
                <span>{i < step ? <Check size={15} /> : i + 1}</span>
                <span>{label}</span>
              </li>
            ))}
          </ol>
          <div className="wizard-step-heading">
            <span>
              {say("STEP", "PASO")} {step + 1} / {steps.length}
            </span>
            <h2 tabIndex={-1} ref={heading}>
              {titles[step]}
            </h2>
          </div>
          <fieldset className="wizard-fields" disabled={busy}>
            {step === 0 && (
              <>
                <Field label={say("Type of call", "Tipo de llamada")}>
                  <select
                    value={plan.purpose}
                    onChange={(e) => selectPurpose(e.target.value as Purpose)}
                  >
                    {Object.entries(purposeLabels[l]).map(([id, text]) => (
                      <option key={id} value={id}>
                        {text}
                      </option>
                    ))}
                  </select>
                </Field>
                {plan.purpose === "appointment" && (
                  <>
                    <fieldset className="choice-field">
                      <legend>
                        {say(
                          "Which kind of appointment?",
                          "¿Con qué servicio?",
                        )}
                      </legend>
                      <div className="wizard-choices">
                        {Object.entries(categoryLabels[l]).map(
                          ([id, label]) => (
                            <label
                              key={id}
                              className={`wizard-choice ${plan.category === id ? "selected" : ""}`}
                            >
                              <input
                                type="radio"
                                name="category"
                                value={id}
                                checked={plan.category === id}
                                required
                                onChange={() => change("category", id)}
                              />
                              <Stethoscope size={19} />
                              <span>{label}</span>
                              {plan.category === id && <Check size={16} />}
                            </label>
                          ),
                        )}
                      </div>
                    </fieldset>
                    {plan.category && (
                      <>
                        <Field
                          label={say(
                            "What is the appointment for?",
                            "¿Cuál es el motivo de la cita?",
                          )}
                          help={say(
                            "Just the reason. No need to write instructions for the agent.",
                            "Solo el motivo. No hace falta escribir instrucciones para el agente.",
                          )}
                        >
                          <input
                            value={plan.reason}
                            required
                            maxLength={600}
                            placeholder={
                              plan.category === "dentist"
                                ? say(
                                    "e.g. Dental cleaning",
                                    "Ej. Limpieza dental",
                                  )
                                : plan.category === "doctor"
                                  ? say(
                                      "e.g. Annual check-up",
                                      "Ej. Revisión anual",
                                    )
                                  : say("e.g. Haircut", "Ej. Corte de pelo")
                            }
                            onChange={(e) => change("reason", e.target.value)}
                          />
                        </Field>
                        <Field
                          label={say(
                            "Have you been there before?",
                            "¿Ya te has atendido ahí?",
                          )}
                        >
                          <select
                            value={plan.patient}
                            onChange={(e) => change("patient", e.target.value)}
                          >
                            <option value="">
                              {say("Not sure / skip", "No lo sé / omitir")}
                            </option>
                            <option value="yes">
                              {say(
                                "Yes, I’m already a patient or customer",
                                "Sí, ya soy paciente o cliente",
                              )}
                            </option>
                            <option value="no">
                              {say(
                                "No, it will be my first visit",
                                "No, será mi primera visita",
                              )}
                            </option>
                          </select>
                        </Field>
                      </>
                    )}
                  </>
                )}
                {plan.purpose === "restaurant" && (
                  <>
                    <Field
                      label={say("How many people?", "¿Para cuántas personas?")}
                    >
                      <input
                        type="number"
                        required
                        min={1}
                        max={30}
                        value={plan.people}
                        onChange={(e) =>
                          change("people", Number(e.target.value))
                        }
                      />
                    </Field>
                    <Field
                      label={say(
                        "Seating or accessibility requests",
                        "Preferencias de mesa o accesibilidad",
                      )}
                      optional={t.optional}
                    >
                      <textarea
                        rows={3}
                        maxLength={1500}
                        placeholder={say(
                          "e.g. A high chair and a quiet table",
                          "Ej. Una silla para bebé y una mesa tranquila",
                        )}
                        value={plan.notes}
                        onChange={(e) => change("notes", e.target.value)}
                      />
                    </Field>
                  </>
                )}
                {plan.purpose === "inquiry" && (
                  <Field
                    label={say(
                      "What questions should we ask?",
                      "¿Qué preguntas quieres que hagamos?",
                    )}
                  >
                    <textarea
                      rows={4}
                      required
                      minLength={5}
                      maxLength={600}
                      placeholder={say(
                        "e.g. How much does a monthly membership cost? Is there a trial class?",
                        "Ej. ¿Cuánto cuesta la mensualidad? ¿Hay una clase de prueba?",
                      )}
                      value={plan.reason}
                      onChange={(e) => change("reason", e.target.value)}
                    />
                  </Field>
                )}
                {plan.purpose === "followup" && (
                  <>
                    <Field
                      label={say(
                        "What are you following up on, and what do you need?",
                        "¿Sobre qué asunto llamamos y qué necesitas saber?",
                      )}
                    >
                      <textarea
                        rows={4}
                        required
                        minLength={5}
                        maxLength={600}
                        placeholder={say(
                          "e.g. I returned an order last week. Find out when the refund will arrive.",
                          "Ej. Devolví un pedido la semana pasada. Quiero saber cuándo llegará el reembolso.",
                        )}
                        value={plan.reason}
                        onChange={(e) => change("reason", e.target.value)}
                      />
                    </Field>
                    <Field
                      label={say(
                        "Order, case or appointment reference",
                        "Número de pedido, caso o cita",
                      )}
                      optional={t.optional}
                    >
                      <input
                        maxLength={200}
                        value={plan.reference}
                        placeholder="Ej. A-1234"
                        onChange={(e) => change("reference", e.target.value)}
                      />
                    </Field>
                  </>
                )}
                {plan.purpose === "custom" && (
                  <Field
                    label={say(
                      "What should Callori do?",
                      "¿Qué quieres que haga Callori?",
                    )}
                  >
                    <textarea
                      rows={4}
                      required
                      minLength={5}
                      maxLength={600}
                      value={plan.reason}
                      onChange={(e) => change("reason", e.target.value)}
                      placeholder={say(
                        "e.g. Ask whether I can collect my order tomorrow.",
                        "Ej. Preguntar si puedo recoger mi pedido mañana.",
                      )}
                    />
                  </Field>
                )}
              </>
            )}
            {step === 1 && (
              <>
                <Field
                  label={
                    plan.purpose === "appointment"
                      ? say(
                          "Clinic or business name",
                          "Nombre de la clínica o del lugar",
                        )
                      : say(
                          "Business or contact name",
                          "Nombre del negocio o contacto",
                        )
                  }
                  optional={t.optional}
                >
                  <input
                    maxLength={200}
                    placeholder={say(
                      "e.g. Central Dental",
                      "Ej. Clínica Dental Central",
                    )}
                    value={plan.business}
                    onChange={(e) => change("business", e.target.value)}
                  />
                </Field>
                <div className="phone-fields">
                  <Field label={say("Calling country", "País al que llamamos")}>
                    <select
                      value={plan.country}
                      onChange={(e) => {
                        change("country", e.target.value as CallingCountry);
                        change("phone", "");
                        setPhoneTouched(false);
                      }}
                    >
                      {callingCountries.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.name[l]} ({item.prefix})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t.phone}>
                    <input
                      ref={phoneInput}
                      type="tel"
                      inputMode="tel"
                      required
                      maxLength={64}
                      autoComplete="off"
                      placeholder={country.example}
                      value={plan.phone}
                      aria-invalid={phoneError || undefined}
                      aria-describedby={
                        phoneError ? "phone-help phone-error" : "phone-help"
                      }
                      onChange={(e) => change("phone", e.target.value)}
                      onBlur={() => {
                        setPhoneTouched(true);
                        if (phone) change("phone", phone.formatNational());
                      }}
                    />
                  </Field>
                </div>
                <div className="phone-guidance">
                  <p id="phone-help" className="field-help">
                    {say(
                      `Enter the local number, including its area code. We add ${country.prefix} automatically. You can also paste an international number.`,
                      `Escribe el número local con su código de área. Añadimos ${country.prefix} automáticamente. También puedes pegar un número internacional.`,
                    )}
                  </p>
                  {phoneError && (
                    <p id="phone-error" className="phone-error" role="alert">
                      {say(
                        `Enter a valid number for ${country.name[l]}, for example ${country.example}.`,
                        `Introduce un número válido de ${country.name[l]}, por ejemplo ${country.example}.`,
                      )}
                    </p>
                  )}
                  {phone && (
                    <p className="phone-preview">
                      <Check size={15} aria-hidden="true" />
                      {say("We’ll dial", "Marcaremos")}{" "}
                      <strong>{phone.formatInternational()}</strong>
                    </p>
                  )}
                </div>
                <Field
                  label={say(
                    "What language do they speak?",
                    "¿En qué idioma atienden?",
                  )}
                  help={say(
                    "Callori will speak that language. You’ll read the conversation in English.",
                    "Callori hablará en ese idioma. Tú leerás la conversación en español.",
                  )}
                >
                  <select
                    value={plan.language}
                    onChange={(e) =>
                      change("language", e.target.value as CallPlan["language"])
                    }
                  >
                    <option value="ja">{t.japanese}</option>
                    <option value="en">{t.english}</option>
                    <option value="es">{t.spanish}</option>
                  </select>
                </Field>
                <label className="profile-toggle">
                  <UserRound size={21} />
                  <span>
                    <strong>
                      {say(
                        "Share my name and relevant profile details",
                        "Compartir mi nombre y datos relevantes del perfil",
                      )}
                    </strong>
                    <small>
                      {name ||
                        say(
                          "Add your full name in Settings.",
                          "Añade tu nombre completo en Configuración.",
                        )}
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={plan.shareProfile}
                    onChange={(e) => change("shareProfile", e.target.checked)}
                  />
                </label>
                {plan.shareProfile && (
                  <div className="identity-preview">
                    <span>
                      {say(
                        "Name used for identification",
                        "Nombre para identificarte",
                      )}
                    </span>
                    <strong>
                      {name || say("Not provided", "No indicado")}
                    </strong>
                    <p>
                      {say(
                        "For a patient or booking name, Callori uses all given names and surnames. A nickname never replaces them.",
                        "Para el nombre del paciente o de la reserva, Callori usa todos tus nombres y apellidos. El nombre preferido no los sustituye.",
                      )}
                    </p>
                    <Link
                      href="/settings"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {say(
                        "Edit profile (new tab)",
                        "Editar perfil (nueva pestaña)",
                      )}{" "}
                      ↗
                    </Link>
                  </div>
                )}
              </>
            )}
            {scheduled && step === 2 && (
              <>
                <p className="wizard-intro">
                  {say(
                    "Add up to three dates that work for you. Or skip this and we’ll ask about availability first.",
                    "Añade hasta tres fechas que te vengan bien. También puedes omitirlas y consultaremos primero la disponibilidad.",
                  )}
                </p>
                {plan.dates.length === 0 && (
                  <div className="date-empty">
                    <CalendarDays size={28} />
                    <strong>
                      {say(
                        "A little flexibility is fine.",
                        "También puedes dejarlo abierto.",
                      )}
                    </strong>
                    <p>
                      {say(
                        "Callori will bring you options before confirming.",
                        "Callori te consultará las opciones antes de confirmar.",
                      )}
                    </p>
                  </div>
                )}
                {plan.dates.map((d, i) => (
                  <div className="date-option" key={i}>
                    <div className="date-option-heading">
                      <strong>
                        {say("Option", "Opción")} {i + 1}
                      </strong>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`${say("Remove option", "Eliminar opción")} ${i + 1}`}
                        onClick={() =>
                          change(
                            "dates",
                            plan.dates.filter((_, j) => i !== j),
                          )
                        }
                      >
                        <X size={17} />
                      </button>
                    </div>
                    <div className="date-fields">
                      <Field label={say("Date", "Fecha")}>
                        <input
                          aria-label={`${say("Date", "Fecha")} ${i + 1}`}
                          type="date"
                          required
                          min={isoToday}
                          value={d.date}
                          onChange={(e) =>
                            change(
                              "dates",
                              plan.dates.map((x, j) =>
                                i === j ? { ...x, date: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label={say("From", "Desde")} optional={t.optional}>
                        <input
                          aria-label={`${say("From", "Desde")} ${i + 1}`}
                          type="time"
                          value={d.from}
                          onChange={(e) =>
                            change(
                              "dates",
                              plan.dates.map((x, j) =>
                                i === j ? { ...x, from: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field
                        label={say("Until", "Hasta")}
                        optional={t.optional}
                      >
                        <input
                          aria-label={`${say("Until", "Hasta")} ${i + 1}`}
                          type="time"
                          min={d.from || undefined}
                          value={d.to}
                          onChange={(e) =>
                            change(
                              "dates",
                              plan.dates.map((x, j) =>
                                i === j ? { ...x, to: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </Field>
                    </div>
                  </div>
                ))}
                {plan.dates.length < 3 && (
                  <button
                    className="button secondary add-date"
                    type="button"
                    onClick={() =>
                      change("dates", [
                        ...plan.dates,
                        { date: "", from: "", to: "" },
                      ])
                    }
                  >
                    <Plus size={17} />
                    {say("Add a date option", "Añadir una opción de fecha")}
                  </button>
                )}
                {plan.dates.length > 0 && (
                  <p className="field-help">
                    {say(
                      `All dates and times are local to ${country.name.en}.`,
                      `Todas las fechas y horas corresponden a la hora local de ${country.name.es}.`,
                    )}
                  </p>
                )}
                {plan.purpose === "appointment" && (
                  <Field
                    label={say(
                      "Anything the clinic needs to know?",
                      "¿Hay algo que la clínica deba saber?",
                    )}
                    optional={t.optional}
                    help={say(
                      "For example, accessibility needs or a doctor you would like to see.",
                      "Por ejemplo, necesidades de accesibilidad o el médico que prefieres.",
                    )}
                  >
                    <textarea
                      rows={2}
                      maxLength={1500}
                      value={plan.notes}
                      onChange={(e) => change("notes", e.target.value)}
                    />
                  </Field>
                )}
                {plan.dates.length > 0 && (
                  <label className="profile-toggle">
                    <ShieldCheck size={21} />
                    <span>
                      <strong>
                        {say(
                          "Check with me before confirming",
                          "Consultarme antes de confirmar",
                        )}
                      </strong>
                      <small>
                        {say(
                          "Turn off to let Callori book one of these options. Fees always require your approval.",
                          "Desactívalo para que Callori reserve una de estas opciones. Los cargos siempre requieren tu aprobación.",
                        )}
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      checked={plan.confirmFirst}
                      onChange={(e) => change("confirmFirst", e.target.checked)}
                    />
                  </label>
                )}
              </>
            )}
            {review && (
              <>
                <div className="review-call-banner">
                  <span>
                    <PhoneCall size={23} />
                  </span>
                  <div>
                    <strong>
                      {plan.business || say("Your contact", "Tu contacto")}
                    </strong>
                    <p>
                      {country.name[l]} ·{" "}
                      {phone?.formatInternational() || plan.phone}
                    </p>
                  </div>
                  <span className="review-live">
                    {say("Real call", "Llamada real")}
                  </span>
                </div>
                <dl className="wizard-review">
                  <div>
                    <dt>{say("The request", "La solicitud")}</dt>
                    <dd>{callInput.objective}</dd>
                  </div>
                  {plan.purpose === "appointment" && plan.patient && (
                    <div>
                      <dt>{say("Previous visits", "Visitas anteriores")}</dt>
                      <dd>
                        {plan.patient === "yes"
                          ? say(
                              "Already a patient or customer",
                              "Ya soy paciente o cliente",
                            )
                          : say("First visit", "Primera visita")}
                      </dd>
                    </div>
                  )}
                  {plan.reference && (
                    <div>
                      <dt>{say("Reference", "Referencia")}</dt>
                      <dd>{plan.reference}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{t.callLanguage}</dt>
                    <dd>
                      {
                        { ja: t.japanese, en: t.english, es: t.spanish }[
                          plan.language
                        ]
                      }
                    </dd>
                  </div>
                  <div>
                    <dt>{say("Your identity", "Tu identidad")}</dt>
                    <dd>
                      {plan.shareProfile
                        ? name ||
                          say(
                            "Missing full name — we’ll ask you if needed",
                            "Falta el nombre completo; te lo preguntaremos si hace falta",
                          )
                        : say(
                            "Profile will not be shared",
                            "No se compartirá tu perfil",
                          )}
                    </dd>
                  </div>
                  {scheduled && (
                    <div>
                      <dt>{say("Date options", "Opciones de fecha")}</dt>
                      <dd>
                        {plan.dates.length ? (
                          <>
                            <ul>
                              {plan.dates.map((d, i) => (
                                <li key={i}>{dateText(d)}</li>
                              ))}
                            </ul>
                            <small>
                              {say(
                                `Local time in ${country.name.en}`,
                                `Hora local de ${country.name.es}`,
                              )}
                            </small>
                          </>
                        ) : (
                          say(
                            "Ask about availability, then check with me",
                            "Consultar disponibilidad y preguntarme",
                          )
                        )}
                      </dd>
                    </div>
                  )}
                  {plan.notes && (
                    <div>
                      <dt>
                        {say("Additional requests", "Peticiones adicionales")}
                      </dt>
                      <dd>{plan.notes}</dd>
                    </div>
                  )}
                  <div>
                    <dt>
                      {say("Permission to confirm", "Permiso para confirmar")}
                    </dt>
                    <dd>
                      {scheduled && plan.dates.length > 0 && !plan.confirmFirst
                        ? say(
                            "May book one of my date options. Ask before accepting fees.",
                            "Puede reservar una de mis opciones. Consultar antes de aceptar cargos.",
                          )
                        : say(
                            "Ask me before confirming or accepting fees.",
                            "Consultarme antes de confirmar o aceptar cargos.",
                          )}
                    </dd>
                  </div>
                </dl>
                {!state.readiness.ready && (
                  <div className="alert warning">
                    <CircleHelp size={20} />
                    <div>
                      <strong>{t.notReady}</strong>
                      <p>{t.notReadySub}</p>
                      <Link href="/settings">{t.viewSettings}</Link>
                    </div>
                  </div>
                )}
                {state.calls.some((c) => !terminal(c.status)) && (
                  <div className="alert warning">
                    {say(
                      "Finish your current call before placing another.",
                      "Termina tu llamada actual antes de iniciar otra.",
                    )}
                  </div>
                )}
                <label className="consent">
                  <input
                    type="checkbox"
                    required
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  {say(
                    "I authorize this call with the details shown above.",
                    "Autorizo esta llamada con los datos que acabo de revisar.",
                  )}
                </label>
              </>
            )}
          </fieldset>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <div className="wizard-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => {
                if (step === 0) router.push("/");
                else {
                  setStep((s) => s - 1);
                  setError("");
                }
              }}
            >
              <ArrowLeft size={17} />
              {say("Back", "Atrás")}
            </button>
            <button
              className="button primary"
              disabled={
                busy ||
                (review &&
                  (!consent ||
                    !state.readiness.ready ||
                    state.calls.some((c) => !terminal(c.status))))
              }
            >
              {busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : review ? (
                <PhoneCall size={18} />
              ) : null}
              {busy
                ? t.preparing
                : review
                  ? say("Place phone call", "Llamar ahora")
                  : say("Continue", "Continuar")}
              {!review && <ArrowRight size={17} />}
            </button>
          </div>
          <p className="wizard-footnote">
            <ShieldCheck size={14} />
            {review
              ? say(
                  "You can end the call at any time.",
                  "Puedes terminar la llamada en cualquier momento.",
                )
              : say(
                  "We won’t call until you review and confirm.",
                  "No llamaremos hasta que revises y confirmes.",
                )}
          </p>
        </form>
        <aside
          className="wizard-aside"
          aria-label={say("Your call at a glance", "Tu llamada de un vistazo")}
        >
          <div className="wizard-summary">
            <div className="summary-symbol">
              {plan.purpose === "restaurant" ? (
                <Utensils size={28} />
              ) : scheduled ? (
                <CalendarDays size={28} />
              ) : (
                <Phone size={28} />
              )}
            </div>
            <span className="eyebrow">
              {say("ONE LESS THING TO DO", "UNA COSA MENOS POR HACER")}
            </span>
            <h2>{purposeLabels[l][plan.purpose]}</h2>
            <p>
              {say(
                "You decide what matters. Callori handles the call.",
                "Tú decides lo importante. Callori se encarga de llamar.",
              )}
            </p>
            <div className="summary-items">
              {plan.reason && (
                <div>
                  <Check size={16} />
                  <span>{plan.reason}</span>
                </div>
              )}
              {plan.purpose === "restaurant" && (
                <div>
                  <UserRound size={16} />
                  <span>
                    {plan.people} {say("people", "personas")}
                  </span>
                </div>
              )}
              {plan.business && (
                <div>
                  <Phone size={16} />
                  <span>{plan.business}</span>
                </div>
              )}
              {plan.dates.some((d) => d.date) && (
                <div>
                  <CalendarDays size={16} />
                  <span>
                    {plan.dates.filter((d) => d.date).length}{" "}
                    {say("date option(s)", "opción(es) de fecha")}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="wizard-reassurance">
            <CheckCheck size={22} />
            <h3>{say("We’ll keep you in the loop.", "Tú sigues al mando.")}</h3>
            <p>
              {say(
                "Read the conversation as it happens. If anything is missing, Callori asks you here without ending the call.",
                "Lee la conversación en tiempo real. Si falta algún dato, Callori te lo pregunta aquí sin cortar la llamada.",
              )}
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
