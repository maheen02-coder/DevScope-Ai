import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  Eye,
  EyeOff,
  Info,
  LoaderCircle,
  TriangleAlert,
  X,
} from 'lucide-react'
import { formatNumber, formatReset, hasScore, initials, scoreTone } from '../lib/format.js'

/* ── Button ────────────────────────────────────────────────── */

export function Button({
  variant = 'secondary',
  size,
  block,
  loading,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}) {
  return (
    <button
      type={type}
      className={clsx(
        'btn',
        variant !== 'secondary' && `btn-${variant}`,
        size && `btn-${size}`,
        block && 'btn-block',
        loading && 'btn-loading',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <LoaderCircle size={15} className="btn-spinner" aria-hidden="true" />
      ) : LeftIcon ? (
        <LeftIcon size={15} aria-hidden="true" />
      ) : null}
      {children}
      {!loading && RightIcon ? <RightIcon size={15} aria-hidden="true" /> : null}
    </button>
  )
}

/* ── Form primitives ───────────────────────────────────────── */

export function Field({ label, htmlFor, hint, error, optional, children, className }) {
  return (
    <div className={clsx('field', className)}>
      {label ? (
        <label className="label" htmlFor={htmlFor}>
          <span>{label}</span>
          {optional ? <span className="label__optional">Optional</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="hint">{hint}</span>
      ) : null}
    </div>
  )
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  autoComplete = 'current-password',
  placeholder = '••••••••',
  ...rest
}) {
  const [visible, setVisible] = useState(false)
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <div className="input-wrap input-wrap--action">
        <input
          id={id}
          className="input"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-invalid={error ? 'true' : undefined}
          {...rest}
        />
        <button
          type="button"
          className="input-wrap__action"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </Field>
  )
}

/* ── Alerts / states ───────────────────────────────────────── */

const alertIcons = {
  info: Info,
  warning: TriangleAlert,
  error: CircleAlert,
  success: CheckCircle2,
}

export function Alert({ tone = 'info', title, children, icon, onDismiss, className }) {
  const Icon = icon || alertIcons[tone] || Info
  return (
    <div
      className={clsx('alert', `alert--${tone}`, className)}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon size={17} aria-hidden="true" />
      <div className="alert__body">
        {title ? <div className="alert__title">{title}</div> : null}
        {children}
      </div>
      {onDismiss ? (
        <button type="button" className="alert__close" onClick={onDismiss} aria-label="Dismiss">
          <X size={14} />
        </button>
      ) : null}
    </div>
  )
}

export function EmptyState({ icon: Icon = Info, title, description, actions, className }) {
  return (
    <div className={clsx('empty', className)}>
      <div className="empty__icon">
        <Icon size={21} aria-hidden="true" />
      </div>
      <div className="empty__title">{title}</div>
      {description ? <p className="empty__desc">{description}</p> : null}
      {actions ? <div className="empty__actions">{actions}</div> : null}
    </div>
  )
}

export function ErrorState({
  title = 'Unable to load this',
  message,
  onRetry,
  retryLabel = 'Try again',
  children,
  className,
}) {
  return (
    <div className={clsx('card error-state', className)}>
      <div className="empty">
        <div className="empty__icon">
          <CircleAlert size={21} aria-hidden="true" />
        </div>
        <div className="empty__title">{title}</div>
        {message ? <p className="empty__desc">{message}</p> : null}
        {children}
        {onRetry ? (
          <div className="empty__actions">
            <Button variant="secondary" onClick={onRetry}>
              {retryLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="empty" role="status" aria-live="polite">
      <div className="spinner spinner--lg" aria-hidden="true" />
      <div className="empty__desc">{label}</div>
    </div>
  )
}

export function Skeleton({ width = '100%', height = 12, circle, className, style }) {
  return (
    <div
      className={clsx('skeleton', circle && 'skeleton--circle', className)}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  )
}

/* ── Scores ────────────────────────────────────────────────── */

const ringConfig = {
  sm: { px: 54, stroke: 4.5 },
  md: { px: 86, stroke: 6 },
  lg: { px: 128, stroke: 8 },
}

export function ScoreRing({ score, size = 'md', label, className }) {
  const { px, stroke } = ringConfig[size] || ringConfig.md
  const scored = hasScore(score)
  const value = scored ? Math.max(0, Math.min(100, Number(score))) : 0
  const radius = (px - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference
  const tone = scoreTone(score)
  const numberSize = size === 'lg' ? 40 : size === 'md' ? 26 : 15

  return (
    <div
      className={clsx('score-ring', `score-ring--${size}`, className)}
      role="img"
      aria-label={`${label || 'Overall score'}: ${scored ? value : 'not scored'} out of 100`}
    >
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} aria-hidden="true">
        <circle
          className="score-ring__track"
          cx={px / 2}
          cy={px / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="score-ring__value"
          cx={px / 2}
          cy={px / 2}
          r={radius}
          fill="none"
          stroke={tone.color}
          strokeWidth={stroke}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="score-ring__label">
        <span className="score-ring__number" style={{ fontSize: numberSize, color: tone.color }}>
          {scored ? value : '—'}
        </span>
        <span className="score-ring__suffix">/100</span>
      </div>
    </div>
  )
}

export function ScoreBar({ label, value }) {
  const scored = hasScore(value)
  const numeric = scored ? Math.max(0, Math.min(100, Number(value))) : 0
  const tone = scoreTone(value)
  return (
    <div className="score-bar">
      <div className="score-bar__head">
        <span>{label}</span>
        <span className="score-bar__value">{scored ? numeric : '—'}</span>
      </div>
      <div className="score-bar__track">
        <div className="score-bar__fill" style={{ width: `${numeric}%`, background: tone.color }} />
      </div>
    </div>
  )
}

export function UsageMeter({ label, icon: Icon, used = 0, limit = 0, resetsAt, compact }) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const toneClass =
    percent >= 90 ? 'meter__fill--danger' : percent >= 75 ? 'meter__fill--warning' : ''
  const remaining = Math.max(0, limit - used)
  const resetLabel = formatReset(resetsAt)
  return (
    <div
      className="meter"
      title={resetLabel ? `Rolling 24h window · resets in ${resetLabel}` : 'Rolling 24h window'}
    >
      <div className="meter__head">
        <span className="meter__label">
          {Icon ? <Icon size={12} aria-hidden="true" /> : null}
          {label}
        </span>
        <span className="meter__value">
          {used} / {limit}
        </span>
      </div>
      <div className="meter__track">
        <div className={clsx('meter__fill', toneClass)} style={{ width: `${percent}%` }} />
      </div>
      {!compact ? (
        <span className="hint">
          {remaining === 0 && resetLabel
            ? `Limit reached · resets in ${resetLabel}`
            : `${remaining} remaining`}
        </span>
      ) : null}
    </div>
  )
}

/* ── Avatar ────────────────────────────────────────────────── */

const avatarSizes = {
  xs: 'avatar--xs',
  sm: 'avatar--sm',
  md: '',
  lg: 'avatar--lg',
  xl: 'avatar--xl',
}

export function Avatar({ src, alt, name, size = 'md', square, className }) {
  const [failedSrc, setFailedSrc] = useState(null)

  const classes = clsx('avatar', avatarSizes[size], square && 'avatar--square', className)

  if (!src || failedSrc === src) {
    return (
      <span className={clsx(classes, 'avatar-fallback')} aria-label={alt || name || 'Avatar'}>
        {initials(name || alt)}
      </span>
    )
  }

  return (
    <img
      className={classes}
      src={src}
      alt={alt || name || 'Avatar'}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
    />
  )
}

/* ── Tabs ──────────────────────────────────────────────────── */

export function Tabs({ items, value, onChange, label = 'View', wide }) {
  const handleKeyDown = (event) => {
    const supported = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
    if (!supported.includes(event.key)) return
    event.preventDefault()
    const currentIndex = items.findIndex((item) => item.value === value)
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % items.length
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + items.length) % items.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = items.length - 1
    onChange(items[nextIndex].value)
    requestAnimationFrame(() => {
      const buttons = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')
      buttons?.[nextIndex]?.focus()
    })
  }

  return (
    <div className={clsx('tabs', wide && 'tabs--wide')} role="tablist" aria-label={label}>
      {items.map((item) => {
        const Icon = item.icon
        const selected = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className="tab"
            onClick={() => onChange(item.value)}
            onKeyDown={handleKeyDown}
          >
            {Icon ? <Icon size={14} aria-hidden="true" /> : null}
            {item.label}
            {item.count !== undefined ? <span className="tab__count">{item.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

/* ── Pagination ────────────────────────────────────────────── */

export function Pagination({ page, totalPages, total, limit, onPageChange, label = 'items' }) {
  if (!total) return null
  const start = (page - 1) * limit + 1
  const end = Math.min(total, page * limit)
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination__info">
        Showing {formatNumber(start)}–{formatNumber(end)} of {formatNumber(total)} {label}
      </span>
      <div className="pagination__controls">
        <Button
          size="sm"
          variant="secondary"
          leftIcon={ChevronLeft}
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="secondary"
          rightIcon={ChevronRight}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next
        </Button>
      </div>
    </nav>
  )
}

/* ── Modal ─────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size,
  closeDisabled,
}) {
  const panelRef = useRef(null)
  const titleId = useId()
  const descriptionId = useId()

  const close = useCallback(() => {
    if (!closeDisabled) onClose()
  }, [onClose, closeDisabled])

  useEffect(() => {
    if (!open) return undefined
    const previousActive = document.activeElement
    const getFocusable = () =>
      Array.from(
        panelRef.current?.querySelectorAll(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) || [],
      ).filter((element) => element.offsetParent !== null)

    const frame = requestAnimationFrame(() => {
      const first = getFocusable()[0]
      if (first) first.focus()
      else panelRef.current?.focus()
    })

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = getFocusable()
      if (!focusable.length) {
        event.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (previousActive && typeof previousActive.focus === 'function') previousActive.focus()
    }
  }, [open, close])

  if (!open) return null

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        className={clsx('modal', size === 'lg' && 'modal--lg')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        ref={panelRef}
        tabIndex={-1}
      >
        {title ? (
          <div className="modal__header">
            <div>
              <h2 className="modal__title" id={titleId}>
                {title}
              </h2>
              {description ? (
                <p className="modal__desc" id={descriptionId}>
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="modal__close"
              onClick={close}
              aria-label="Close dialog"
              disabled={closeDisabled}
            >
              <X size={16} />
            </button>
          </div>
        ) : null}
        <div className="modal__body">{children}</div>
        {footer ? <div className="modal__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'danger',
  loading,
  children,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      closeDisabled={loading}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger-solid' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  )
}

/* ── Page header / stat card ───────────────────────────────── */

export function PageHeader({ breadcrumb, eyebrow, title, description, actions, className }) {
  return (
    <header className={clsx('page-head', className)}>
      <div className="page-head__main">
        {breadcrumb ? (
          <div className="breadcrumb" style={{ marginBottom: 10 }}>
            {breadcrumb}
          </div>
        ) : null}
        {eyebrow ? <div className="page-head__eyebrow">{eyebrow}</div> : null}
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-sub">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  )
}

export function StatCard({ label, value, icon: Icon, hint, accent }) {
  return (
    <div className="stat-card">
      <div className="stat-card__top">
        <div>
          <div className="stat-card__label">{label}</div>
          <div className="stat-card__value">{value}</div>
        </div>
        {Icon ? (
          <span className={clsx('icon-tile', accent && `icon-tile--${accent}`)}>
            <Icon size={16} aria-hidden="true" />
          </span>
        ) : null}
      </div>
      {hint ? <div className="stat-card__foot">{hint}</div> : null}
    </div>
  )
}

/* ── Copy button ───────────────────────────────────────────── */

export function CopyButton({ value, label = 'Copy', className }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        const area = document.createElement('textarea')
        area.value = value
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        document.body.removeChild(area)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className={className}
      leftIcon={copied ? Check : Copy}
      onClick={copy}
      aria-label={copied ? 'Copied' : label}
    >
      {copied ? 'Copied' : label}
    </Button>
  )
}
