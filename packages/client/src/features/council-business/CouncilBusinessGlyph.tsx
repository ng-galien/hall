import { CouncilBusinessIcon } from "../../components/icons";
import { ListRowIcon } from "../../components/ui/list-row";
import type { CouncilBusinessView } from "../../models/councilBusiness";
import { folderColorIconProps } from "../../pages/workspace/folderColor";

/** `color` is the shared colour of the business folder; only the icon takes it. */
export function CouncilBusinessGlyph({
  large,
  color,
}: {
  business: CouncilBusinessView;
  large?: boolean;
  color?: string | null;
}) {
  return (
    <ListRowIcon nature="council" large={large}>
      <CouncilBusinessIcon {...folderColorIconProps(color)} />
    </ListRowIcon>
  );
}
