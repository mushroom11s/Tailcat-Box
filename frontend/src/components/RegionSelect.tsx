import { useI18n } from "../i18n";
import { regionOptions } from "../lib/miao";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export default function RegionSelect({ id, value, onChange, disabled }: Props) {
  const { t, locale } = useI18n();
  const options = regionOptions(locale);
  const known = value === "" || options.some((item) => item.code === value);
  return (
    <select id={id} className="glass-select" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">{t("regionAuto")}</option>
      {options.map((item) => (
        <option key={item.code} value={item.code}>
          {item.label}
        </option>
      ))}
      {!known ? <option value={value}>{value}</option> : null}
    </select>
  );
}
