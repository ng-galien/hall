import { IconContext, PushPin } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export {
  AddressBook as ContactIcon,
  ArrowBendUpRight as MoveIcon,
  ArrowClockwise as RedoIcon,
  ArrowCounterClockwise as UndoIcon,
  ArrowDown as ArrowDownIcon,
  ArrowLeft as BackIcon,
  ArrowRight as ForwardIcon,
  ArrowSquareOut as OpenIcon,
  ArrowsClockwise as RegenerateIcon,
  ArrowsHorizontal as BothDirectionsIcon,
  ArrowsInLineHorizontal as MergeCellsIcon,
  ArrowsOut as FullscreenIcon,
  ArrowsOutLineHorizontal as SplitCellIcon,
  ArrowUp as ArrowUpIcon,
  At as ReferenceIcon,
  Bank as CouncilIcon,
  BookmarkSimple as SaveViewIcon,
  BookOpenText as DocsIcon,
  BookOpenText as LegalReferenceIcon,
  BoundingBox as FitBoundsIcon,
  Briefcase as CouncilBusinessIcon,
  Bug as DebugIcon,
  Buildings as CommuneIcon,
  CalendarBlank as CalendarIcon,
  CalendarCheck as TodayIcon,
  CalendarDot as DayViewIcon,
  CalendarDots as AgendaIcon,
  CalendarPlus as CalendarAddIcon,
  Camera as CameraIcon,
  CaretDoubleLeft as CollapseIcon,
  CaretDoubleRight as ExpandIcon,
  CaretDown as ChevronDownIcon,
  CaretLeft as ChevronLeftIcon,
  CaretRight as ChevronRightIcon,
  CaretUp as ChevronUpIcon,
  ChatsCircle as CommissionsIcon,
  Check as CheckIcon,
  CheckCircle as CheckCircleIcon,
  Clock as ClockIcon,
  CloudArrowUp as AutosaveSavingIcon,
  CloudCheck as AutosaveOnIcon,
  CloudSlash as AutosaveOffIcon,
  Columns as ColumnIcon,
  Columns as WeekViewIcon,
  ColumnsPlusLeft as ColumnBeforeIcon,
  ColumnsPlusRight as ColumnAfterIcon,
  Copy as CopyIcon,
  Crosshair as CenterOnFeatureIcon,
  CursorClick as PointerIcon,
  DotsSixVertical as DragHandleIcon,
  DotsThree as MoreIcon,
  DotsThreeVertical as MoreVerticalIcon,
  DownloadSimple as DownloadIcon,
  Envelope as MailIcon,
  Eye as VisibleIcon,
  EyeSlash as HiddenIcon,
  File as FileIcon,
  FileCsv as CsvIcon,
  FileDoc as WordDocumentIcon,
  FilePdf as PdfIcon,
  FilePlus as GenerateIcon,
  FilePpt as PresentationDocumentIcon,
  Files as DossierIcon,
  FileText as TextDocumentIcon,
  FileXls as SpreadsheetDocumentIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  FolderPlus as FolderAddIcon,
  Funnel as FilterIcon,
  Gavel as GavelIcon,
  Gear as SettingsIcon,
  Globe as WebIcon,
  GridNine as MonthViewIcon,
  Handshake as DelegationIcon,
  Highlighter as HighlightIcon,
  House as HomeIcon,
  Image as ImageIcon,
  ImageSquare as InsertImageIcon,
  Info as InfoIcon,
  Kanban as WorkspaceIcon,
  Key as RightsIcon,
  Lightbulb as TipIcon,
  LinkBreak as LinkOffIcon,
  LinkSimple as LinkIcon,
  ListBullets as DecisionsIcon,
  ListBullets as ListBulletedIcon,
  ListChecks as AttendanceSheetIcon,
  ListChecks as ChecklistIcon,
  ListNumbers as ListNumberedIcon,
  Lock as LockIcon,
  MagnifyingGlass as SearchIcon,
  MapPin as LocationIcon,
  MapTrifold as MapIcon,
  Megaphone as NoticeIcon,
  Minus as RuleIcon,
  Moon as DarkThemeIcon,
  Notebook as MinutesIcon,
  NotePencil as DraftIcon,
  Palette as ColorIcon,
  Paperclip as AttachIcon,
  PaperPlaneTilt as SentIcon,
  Paragraph as ParagraphIcon,
  Path as LineIcon,
  PencilSimple as EditIcon,
  PencilSimpleLine as SignIcon,
  Phone as PhoneIcon,
  Play as PlayIcon,
  Plus as AddIcon,
  Polygon as AreaIcon,
  Printer as PrintIcon,
  PushPin as PinIcon,
  Quotes as QuoteIcon,
  Rows as ListViewIcon,
  Rows as RowIcon,
  RowsPlusBottom as RowAfterIcon,
  RowsPlusTop as RowBeforeIcon,
  Ruler as RulerIcon,
  Scales as OfficialRuleIcon,
  ShareNetwork as ShareIcon,
  ShieldCheck as AdministrationIcon,
  Sidebar as SidebarExpandIcon,
  SidebarSimple as SidebarCollapseIcon,
  Sigma as SumIcon,
  SortAscending as SortIcon,
  Stack as LayersIcon,
  Stamp as TemplateIcon,
  Sun as LightThemeIcon,
  Table as TableIcon,
  Tag as TagIcon,
  TextAa as FormattingIcon,
  TextAlignCenter as AlignCenterIcon,
  TextAlignLeft as AlignLeftIcon,
  TextAlignRight as AlignRightIcon,
  TextB as BoldIcon,
  Textbox as BoxedTextIcon,
  TextH as HeadingIcon,
  TextHThree as HeadingThreeIcon,
  TextHTwo as HeadingTwoIcon,
  TextIndent as IndentIcon,
  TextItalic as ItalicIcon,
  TextOutdent as OutdentIcon,
  TextStrikethrough as StrikethroughIcon,
  TextUnderline as UnderlineIcon,
  Translate as TranslateIcon,
  Trash as DeleteIcon,
  UploadSimple as UploadIcon,
  User as MemberIcon,
  UserCircle as AccountIcon,
  UserMinus as RecusalIcon,
  UserSwitch as ProxyIcon,
  Users as MembersIcon,
  UsersThree as CommitteeIcon,
  Warning as WarningIcon,
  X as CloseIcon,
} from "@phosphor-icons/react";

export function PinnedIcon(props: { className?: string }) {
  return <PushPin {...props} className={`pinned-icon ${props.className ?? ""}`} />;
}

/** The president's hand bell, drawn on the Phosphor grid with its regular stroke. */
export function MeetingOpeningIcon(props: { className?: string }) {
  return (
    <svg
      className={`app-icon ${props.className ?? ""}`}
      width="1em"
      height="1em"
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      strokeWidth="16"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="112" y="8" width="32" height="56" rx="8" />
      <path d="M56 192c8-16 16-48 16-72a56 56 0 0 1 112 0c0 24 8 56 16 72Z" />
      <path d="M32 192h192" />
      <circle cx="128" cy="220" r="14" />
    </svg>
  );
}

/** Icon rendering defaults; size is `1em` so CSS `font-size` drives each glyph. */
export function IconDefaults({ children }: { children: ReactNode }) {
  return (
    <IconContext.Provider value={{ size: "1em", weight: "regular", className: "app-icon" }}>
      {children}
    </IconContext.Provider>
  );
}
