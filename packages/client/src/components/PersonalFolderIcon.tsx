import { FolderUser, type Icon, IconBase, type IconProps, type IconWeight } from "@phosphor-icons/react";
import { forwardRef, type ReactElement, useId } from "react";

/** Person of Phosphor « FolderUser », drawn in the lower right corner of the open folder. */
const personPaths: Partial<Record<IconWeight, string>> = {
  regular:
    "M214.61,198.62a32,32,0,1,0-45.23,0,40,40,0,0,0-17.11,23.32,8,8,0,0,0,5.67,9.79A8.15,8.15,0,0,0,160,232a8,8,0,0,0,7.73-5.95C170.56,215.42,180.54,208,192,208s21.44,7.42,24.27,18.05a8,8,0,1,0,15.46-4.11A40,40,0,0,0,214.61,198.62ZM192,160a16,16,0,1,1-16,16A16,16,0,0,1,192,160Z",
  bold: "M220.51,197.94a36,36,0,1,0-57,0,43.75,43.75,0,0,0-15.08,23,12,12,0,0,0,8.52,14.67A11.77,11.77,0,0,0,160,236a12,12,0,0,0,11.59-8.92C174,218.2,182.35,212,192,212s18,6.2,20.4,15.08a12,12,0,0,0,23.19-6.17A43.7,43.7,0,0,0,220.51,197.94ZM192,164a12,12,0,1,1-12,12A12,12,0,0,1,192,164Z",
};

/** Phosphor « FolderOpen », cut around the person. */
const openFolderPaths: Partial<Record<IconWeight, string>> = {
  regular:
    "M245,110.64A16,16,0,0,0,232,104H216V88a16,16,0,0,0-16-16H130.67L102.94,51.2a16.14,16.14,0,0,0-9.6-3.2H40A16,16,0,0,0,24,64V208h0a8,8,0,0,0,8,8H211.1a8,8,0,0,0,7.59-5.47l28.49-85.47A16.05,16.05,0,0,0,245,110.64ZM93.34,64,123.2,86.4A8,8,0,0,0,128,88h72v16H69.77a16,16,0,0,0-15.18,10.94L40,158.7V64Zm112,136H43.1l26.67-80H232Z",
  bold: "M248.23,112.31A20,20,0,0,0,232,104H220V88a20,20,0,0,0-20-20H132L105.34,48a20.12,20.12,0,0,0-12-4H40A20,20,0,0,0,20,64V208a12,12,0,0,0,12,12H211.1a12,12,0,0,0,11.33-8l28.49-81.47.06-.17A20,20,0,0,0,248.23,112.31ZM92,68l28.8,21.6A12,12,0,0,0,128,92h68v12H69.77a20,20,0,0,0-18.94,13.58L44,137.15V68ZM202.59,196H48.89l23.72-68H226.37Z",
};

/** Closed personal folder: a folder marked with a person. */
export const PersonalFolderIcon: Icon = FolderUser;

/** Open personal folder: the open folder marked with the same person. */
export const PersonalFolderOpenIcon: Icon = forwardRef<SVGSVGElement, IconProps>((props, ref) => {
  const mask = `personal-folder-${useId().replace(/:/g, "")}`;
  const weights = new Map<IconWeight, ReactElement>(
    (["thin", "light", "regular", "bold", "fill", "duotone"] as const).map((weight) => {
      const strong = weight === "bold" || weight === "fill";
      return [
        weight,
        <>
          <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256">
            <rect width="256" height="256" fill="white" />
            <circle cx="192" cy="190" r="58" fill="black" />
          </mask>
          <path d={strong ? openFolderPaths.bold : openFolderPaths.regular} mask={`url(#${mask})`} />
          <path d={strong ? personPaths.bold : personPaths.regular} />
        </>,
      ];
    }),
  );
  return <IconBase ref={ref} {...props} weights={weights} />;
});
PersonalFolderOpenIcon.displayName = "PersonalFolderOpenIcon";
