import { CALENDAR_COLORS } from "@/lib/validation/scheduling";
import { CALENDAR_COLOR_HEX } from "@/lib/calendar-colors";

/** Radio swatches for a barber's calendar colour. Works without client JavaScript. */
export function ColorPicker({ name, defaultValue }: { name: string; defaultValue: string }) {
  return (
    <fieldset>
      <legend className="text-[13px] font-medium">Calendar colour</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {CALENDAR_COLORS.map((c) => (
          <label key={c} className="cursor-pointer" title={c}>
            <input type="radio" name={name} value={c} defaultChecked={defaultValue === c} className="peer sr-only" />
            <span
              className="block size-7 rounded-full ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-fg peer-focus-visible:ring-2 peer-focus-visible:ring-fg"
              style={{ background: CALENDAR_COLOR_HEX[c] }}
            />
            <span className="sr-only">{c}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
