import { Action, ActionPanel, Icon, LocalStorage, Toast, showToast } from "@raycast/api";
import { Command, StoreCommand, isCommand, isStoreCommand, isTrueStr } from "../../../utils/types";
import CommandForm from "../CommandForm";
import { QUICKLINK_URL_BASE } from "../../../utils/constants";
import { updateCommand } from "../../../utils/command-utils";
import { defaultAdvancedSettings } from "../../../data/default-advanced-settings";
import { anyActionsEnabled } from "../../../utils/action-utils";
import DeleteAllAction from "../../actions/DeleteAllAction";
import DeleteAction from "../../actions/DeleteAction";
import ToggleFavoriteAction from "../../actions/ToggleFavoriteAction";
import crypto from "crypto";

/**
 * Section for actions related to modifying commands (editing, deleting, etc.).
 * @param props.command The command to modify
 * @param props.availableCommands The list of commands available to install
 * @param props.commands The list of all installed commands
 * @param props.setCommands The function to update the list of installed commands
 * @returns An ActionPanel.Section component
 */
export const CommandControlsActionsSection = (props: {
  command: Command | StoreCommand;
  availableCommands?: StoreCommand[];
  commands: Command[];
  setCommands: React.Dispatch<React.SetStateAction<Command[]>>;
  setTemplates: React.Dispatch<React.SetStateAction<Command[]>>;
  settings: typeof defaultAdvancedSettings;
}) => {
  const { command, availableCommands, commands, setCommands, setTemplates, settings } = props;

  if (
    !anyActionsEnabled(
      [
        "ToggleFavoriteAction",
        "CreateQuickLinkAction",
        "EditCommandAction",
        "CreateDerivativeAction",
        "DeleteCommandAction",
        "DeleteAllCommandsAction",
        "InstallAllCommandsAction",
      ],
      settings
    )
  ) {
    return null;
  }

  return (
    <ActionPanel.Section title="Command Controls">
      {isCommand(command) ? (
        <>
          <ToggleFavoriteAction
            toggleMethod={async () => {
              const newCmdData = { ...command, favorited: command.favorited == true ? false : true };
              await updateCommand(command, newCmdData, setCommands);
            }}
            currentStatus={command.favorited || false}
            settings={settings}
          />

          <CreateQuickLinkAction command={command} />
          <EditCommandAction command={command} setCommands={setCommands} setTemplates={setTemplates} />
          <CreateDerivativeAction command={command} setCommands={setCommands} setTemplates={setTemplates} />
          <DeleteCommandAction command={command} commands={commands} setCommands={setCommands} settings={settings} />
          <DeleteAllCommandsAction commands={commands} setCommands={setCommands} settings={settings} />
        </>
      ) : null}
      {isStoreCommand(command) ? (
        <>
          <InstallAllCommandsAction
            availableCommands={availableCommands || []}
            commands={commands}
            setCommands={setCommands}
          />
          <CreateDerivativeAction command={command} setCommands={setCommands} setTemplates={setTemplates} />
        </>
      ) : null}
    </ActionPanel.Section>
  );
};

/**
 * Action to display the "Create QuickLink" view for a command.
 * @param props.command The command to create a QuickLink for
 * @returns An Action component
 */
export const CreateQuickLinkAction = (props: { command: Command }) => {
  const { command } = props;
  return (
    <Action.CreateQuicklink
      quicklink={{
        link: `${QUICKLINK_URL_BASE}${encodeURIComponent(command.id)}%22${
          command.prompt?.includes("{{input}}") ? "%2C%22queryInput%22%3A%22{Input}%22" : ""
        }%7D`,
        name: command.name,
      }}
      shortcut={{ modifiers: ["cmd", "shift"], key: "q" }}
    />
  );
};

/**
 * Action to display the "Edit Command" form for a command.
 * @param props.command The command to edit
 * @param props.setCommands The function to update the list of installed commands
 * @returns An Action component
 */
export const EditCommandAction = (props: {
  command: Command;
  setCommands: React.Dispatch<React.SetStateAction<Command[]>>;
  setTemplates: React.Dispatch<React.SetStateAction<Command[]>>;
}) => {
  const { command, setCommands, setTemplates } = props;
  return (
    <Action.Push
      title="Edit Command"
      target={
        <CommandForm
          oldData={{
            id: command.id,
            name: command.name,
            prompt: command.prompt,
            icon: command.icon,
            iconColor: command.iconColor,
            minNumFiles: command.minNumFiles?.toString(),
            acceptedFileExtensions: command.acceptedFileExtensions,
            useMetadata: command.useMetadata,
            useAudioDetails: command.useAudioDetails,
            useSoundClassification: command.useSoundClassification,
            useSubjectClassification: command.useSubjectClassification,
            useRectangleDetection: command.useRectangleDetection,
            useBarcodeDetection: command.useBarcodeDetection,
            useFaceDetection: command.useFaceDetection,
            useHorizonDetection: command.useHorizonDetection,
            outputKind: command.outputKind,
            actionScript: command.actionScript,
            showResponse: command.showResponse,
            description: command.description,
            useSaliencyAnalysis: command.useSaliencyAnalysis,
            author: command.author,
            website: command.website,
            version: command.version,
            requirements: command.requirements,
            scriptKind: command.scriptKind,
            categories: command.categories || [],
            temperature: command.temperature == undefined || command.temperature == "" ? "1.0" : command.temperature,
            favorited: command.favorited ? command.favorited : false,
            model: command.model,
            setupConfig: command.setupConfig,
            installedFromStore: command.installedFromStore,
            setupLocked: command.setupLocked,
            useSpeech: command.useSpeech,
            speakResponse: command.speakResponse,
            showInMenuBar: command.showInMenuBar,
          }}
          setCommands={setCommands}
          setTemplates={setTemplates}
        />
      }
      icon={Icon.Pencil}
      shortcut={{ modifiers: ["cmd"], key: "e" }}
    />
  );
};

/**
 * Action to delete a single command.
 * @param props.command The command to delete
 * @param props.commands The list of installed commands
 * @param props.setCommands The function to update the list of installed commands
 * @param props.settings The advanced settings
 * @returns An Action component
 */
export const DeleteCommandAction = (props: {
  command: Command;
  commands: Command[];
  setCommands: React.Dispatch<React.SetStateAction<Command[]>>;
  settings: typeof defaultAdvancedSettings;
}) => {
  return (
    <DeleteAction
      deleteMethod={async () => {
        const newCommands = props.commands.filter((cmd) => cmd.name != props.command.name);
        await LocalStorage.removeItem(props.command.name);
        props.setCommands(newCommands);
      }}
      objectType="Command"
      settings={props.settings}
    />
  );
};

/**
 * Action to delete all commands.
 * @param props.commands The list of installed commands
 * @param props.setCommands The function to update the list of installed commands
 * @param props.settings The advanced settings
 * @returns An Action component
 */
export const DeleteAllCommandsAction = (props: {
  commands: Command[];
  setCommands: React.Dispatch<React.SetStateAction<Command[]>>;
  settings: typeof defaultAdvancedSettings;
}) => {
  return (
    <DeleteAllAction
      deleteMethod={async () => {
        for (const cmd of props.commands) {
          await LocalStorage.removeItem(cmd.name);
        }
        props.setCommands([]);
      }}
      objectType="Commands"
      settings={props.settings}
    />
  );
};

/**
 * Action to display the "Create Derivative" form for a command.
 * @param props.command The command to create a derivative of
 * @param props.setCommands The function to update the list of installed commands
 * @returns An Action component
 */
export const CreateDerivativeAction = (props: {
  command: Command | StoreCommand;
  setCommands: React.Dispatch<React.SetStateAction<Command[]>>;
  setTemplates: React.Dispatch<React.SetStateAction<Command[]>>;
}) => {
  const { command, setCommands, setTemplates } = props;
  return (
    <Action.Push
      title="Create Derivative"
      target={
        <CommandForm
          oldData={{
            id: isCommand(command) ? command.id : "",
            name: command.name + (isCommand(command) ? " (Copy)" : ""),
            prompt: command.prompt,
            icon: command.icon,
            iconColor: command.iconColor,
            minNumFiles: command.minNumFiles?.toString(),
            acceptedFileExtensions: command.acceptedFileExtensions == "None" ? "" : command.acceptedFileExtensions,
            useMetadata: isTrueStr(command.useMetadata),
            useAudioDetails: isTrueStr(command.useAudioDetails),
            useSoundClassification: isTrueStr(command.useSoundClassification),
            useSubjectClassification: isTrueStr(command.useSubjectClassification),
            useRectangleDetection: isTrueStr(command.useRectangleDetection),
            useBarcodeDetection: isTrueStr(command.useBarcodeDetection),
            useFaceDetection: isTrueStr(command.useFaceDetection),
            useHorizonDetection: isTrueStr(command.useHorizonDetection),
            outputKind: command.outputKind,
            actionScript: command.actionScript,
            showResponse: isTrueStr(command.showResponse),
            description: command.description,
            useSaliencyAnalysis: isTrueStr(command.useSaliencyAnalysis),
            author: command.author,
            website: command.website,
            version: command.version,
            requirements: command.requirements,
            scriptKind: command.scriptKind,
            categories: isStoreCommand(command)
              ? command.categories?.split(", ") || ["Other"]
              : command.categories || [],
            temperature: command.temperature == undefined || command.temperature == "" ? "1.0" : command.temperature,
            favorited: isStoreCommand(command) ? false : command.favorited,
            setupConfig: isStoreCommand(command)
              ? command.setupConfig?.length && command.setupConfig != "None"
                ? JSON.parse(command.setupConfig)
                : undefined
              : command.setupConfig,
            installedFromStore: isStoreCommand(command) ? true : command.installedFromStore,
            setupLocked: isStoreCommand(command) ? false : command.setupLocked,
            useSpeech: isTrueStr(command.useSpeech),
            speakResponse: isTrueStr(command.speakResponse),
            showInMenuBar: isStoreCommand(command) ? false : command.showInMenuBar,
            model: isCommand(command) ? command.model : undefined,
          }}
          setCommands={setCommands}
          duplicate={true}
          setTemplates={setTemplates}
        />
      }
      icon={Icon.EyeDropper}
      shortcut={{ modifiers: ["ctrl"], key: "c" }}
    />
  );
};

/**
 * Action submenu & actions to create a command from a template.
 * @param props.setCommands The function to update the list of installed commands
 * @returns An Action component
 */
export const CreateFromTemplateMenu = (props: {
  commands: Command[];
  templates: Command[];
  setCommands: React.Dispatch<React.SetStateAction<Command[]>>;
  setTemplates: React.Dispatch<React.SetStateAction<Command[]>>;
}) => {
  const { commands, templates, setCommands, setTemplates } = props;

  if (!templates || templates.length == 0) {
    return null;
  }

  return (
    <ActionPanel.Submenu
      title="Create Command From Template..."
      icon={Icon.Center}
      shortcut={{ modifiers: ["cmd"], key: "t" }}
    >
      {templates.map((template) => {
        let id = crypto.randomUUID();
        while (commands.some((cmd) => cmd.id == id) || templates.some((cmd) => cmd.id == id)) {
          id = crypto.randomUUID();
        }
        return (
          <Action.Push
            title={template.name}
            target={
              <CommandForm
                oldData={{
                  id: id,
                  name: "",
                  prompt: template.prompt,
                  icon: template.icon,
                  iconColor: template.iconColor,
                  minNumFiles: template.minNumFiles?.toString(),
                  acceptedFileExtensions:
                    template.acceptedFileExtensions == "None" ? "" : template.acceptedFileExtensions,
                  useMetadata: isTrueStr(template.useMetadata),
                  useAudioDetails: isTrueStr(template.useAudioDetails),
                  useSoundClassification: isTrueStr(template.useSoundClassification),
                  useSubjectClassification: isTrueStr(template.useSubjectClassification),
                  useRectangleDetection: isTrueStr(template.useRectangleDetection),
                  useBarcodeDetection: isTrueStr(template.useBarcodeDetection),
                  useFaceDetection: isTrueStr(template.useFaceDetection),
                  useHorizonDetection: isTrueStr(template.useHorizonDetection),
                  outputKind: template.outputKind,
                  actionScript: template.actionScript,
                  showResponse: isTrueStr(template.showResponse),
                  description: template.description,
                  useSaliencyAnalysis: isTrueStr(template.useSaliencyAnalysis),
                  author: template.author,
                  website: template.website,
                  version: template.version,
                  requirements: template.requirements,
                  scriptKind: template.scriptKind,
                  categories: template.categories || [],
                  temperature:
                    template.temperature == undefined || template.temperature == "" ? "1.0" : template.temperature,
                  favorited: template.favorited,
                  setupConfig: template.setupConfig,
                  installedFromStore: false,
                  setupLocked: template.setupLocked,
                  useSpeech: isTrueStr(template.useSpeech),
                  speakResponse: isTrueStr(template.speakResponse),
                  showInMenuBar: template.showInMenuBar,
                  model: template.model,
                }}
                setCommands={setCommands}
                setTemplates={setTemplates}
                duplicate={true}
              />
            }
            icon={{ source: Icon.Center, tintColor: template.iconColor }}
          />
        );
      })}
    </ActionPanel.Submenu>
  );
};

/**
 * Action to install all available commands from the store.
 * @param props.availableCommands The list of available commands
 * @param props.commands The list of installed commands
 * @param props.setCommands The function to update the list of installed commands
 * @returns An Action component
 */
export const InstallAllCommandsAction = (props: {
  availableCommands: StoreCommand[];
  commands: Command[];
  setCommands: React.Dispatch<React.SetStateAction<Command[]>>;
}) => {
  const { availableCommands, commands, setCommands } = props;

  const knownCommandNames = commands.map((command) => command.name);
  const knownPrompts = commands.map((command) => command.prompt);

  return (
    <Action
      title="Install All Commands"
      icon={Icon.Plus}
      shortcut={{ modifiers: ["cmd", "shift"], key: "i" }}
      onAction={async () => {
        const successes: string[] = [];
        const failures: string[] = [];
        const toast = await showToast({ title: "Installing Commands...", style: Toast.Style.Animated });

        for (const command of availableCommands) {
          let cmdName = command.name;
          if (knownCommandNames?.includes(command.name)) {
            cmdName = `${command.name} 2`;
          }
          if (knownPrompts?.includes(command.prompt)) {
            failures.push(command.name);
            continue;
          }
          const commandData = {
            name: cmdName,
            prompt: command.prompt,
            icon: command.icon,
            iconColor: command.iconColor,
            minNumFiles: parseInt(command.minNumFiles as string),
            acceptedFileExtensions: command.acceptedFileExtensions == "None" ? "" : command.acceptedFileExtensions,
            useMetadata: command.useMetadata == "TRUE" ? true : false,
            useSoundClassification: command.useSoundClassification == "TRUE" ? true : false,
            useAudioDetails: command.useAudioDetails == "TRUE" ? true : false,
            useSubjectClassification: command.useSubjectClassification == "TRUE" ? true : false,
            useRectangleDetection: command.useRectangleDetection == "TRUE" ? true : false,
            useBarcodeDetection: command.useBarcodeDetection == "TRUE" ? true : false,
            useFaceDetection: command.useFaceDetection == "TRUE" ? true : false,
            useHorizonDetection: command.useHorizonDetection == "TRUE" ? true : false,
            outputKind: command.outputKind,
            actionScript: command.actionScript,
            showResponse: command.showResponse == "TRUE" ? true : false,
            description: command.description,
            useSaliencyAnalysis: command.useSaliencyAnalysis == "TRUE" ? true : false,
            author: command.author,
            website: command.website,
            version: command.version,
            requirements: command.requirements,
            scriptKind: command.scriptKind,
            categories: command.categories?.split(", ") || ["Other"],
            temperature: command.temperature,
            favorited: false,
            setupConfig:
              command.setupConfig?.length && command.setupConfig != "None"
                ? JSON.parse(command.setupConfig)
                : undefined,
            installedFromStore: true,
            setupLocked: true,
            useSpeech: command.useSpeech == "TRUE" ? true : false,
            speakResponse: command.speakResponse == "TRUE" ? true : false,
            showInMenuBar: false,
          };
          await LocalStorage.setItem(cmdName, JSON.stringify(commandData));
          successes.push(command.name);

          const allCommands = await LocalStorage.allItems();
          const filteredCommands = Object.values(allCommands).filter(
            (cmd, index) =>
              Object.keys(allCommands)[index] != "--defaults-installed" &&
              !Object.keys(allCommands)[index].startsWith("id-")
          );
          setCommands(filteredCommands.map((data) => JSON.parse(data)));
        }

        if (successes.length > 0 && failures.length == 0) {
          toast.title = `Installed ${successes.length} Command${successes.length == 1 ? "" : "s"}`;
          toast.style = Toast.Style.Success;
        } else if (successes.length > 0 && failures.length > 0) {
          toast.title = `Installed ${successes.length} Command${successes.length == 1 ? "" : "s"}`;
          toast.message = `Failed to install ${failures.length} command${
            failures.length == 1 ? "" : "s"
          }: ${failures.join(", ")}`;
          toast.style = Toast.Style.Success;
        } else if (failures.length > 0) {
          toast.title = `Failed To Install ${failures.length} Command${failures.length == 1 ? "" : "s"}`;
          toast.message = failures.join(", ");
          toast.style = Toast.Style.Failure;
        }
      }}
    />
  );
};
