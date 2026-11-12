import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

/** Historical locations remain selectable after removal from Hall's catalogue. */
export function MeetingLocationSelect({
  id,
  locations,
  current,
  testId,
  disabled = false,
}: {
  id?: string;
  locations: string[];
  current: string | null;
  testId: string;
  disabled?: boolean;
}) {
  const choices = current && !locations.includes(current) ? [current, ...locations] : locations;
  return (
    <Select name="location" defaultValue={current || locations[0]} disabled={disabled} required>
      <SelectTrigger id={id} data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {choices.map((name) => (
          <SelectItem key={name} value={name} data-testid={`${testId}-option-${name}`}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
