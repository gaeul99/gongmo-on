import './ToggleSwitch.css'

type ToggleSwitchProps = {
  // 라벨과 연결할 때 쓴다 — <label htmlFor>가 이 id를 가리키면 텍스트 클릭으로도 켜고 끈다.
  id?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  // 화면에 라벨 없이 쓸 때만 지정한다(접근성 이름).
  ariaLabel?: string
}

// iOS식 on/off 토글 스위치. role="switch" 버튼이라 키보드(스페이스·엔터)와
// 스크린리더에서도 켜고 끌 수 있다.
function ToggleSwitch({ id, checked, onChange, disabled = false, ariaLabel }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={`toggle-switch${checked ? ' is-on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-switch-knob" />
    </button>
  )
}

export default ToggleSwitch
