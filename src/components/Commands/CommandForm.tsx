import {
  Action,
  ActionPanel,
  Form,
  showToast,
  Icon,
  useNavigation,
  Color,
  environment,
  getPreferenceValues,
} from "@raycast/api";
import { useForm, FormValidation } from "@raycast/utils";
import { useModels } from "../../hooks/useModels";
import {
  BooleanConfigField,
  Command,
  CommandConfig,
  ExtensionPreferences,
  NumberConfigField,
  StringConfigField,
} from "../../utils/types";
import { Fragment, useEffect, useState } from "react";
import * as crypto from "crypto";
import { useRef } from "react";
import { Placeholders, checkForPlaceholders } from "../../utils/placeholders";
import {
  EditCustomPlaceholdersAction,
  OpenAdvancedSettingsAction,
  OpenPlaceholdersGuideAction,
} from "../actions/OpenFileActions";
import { updateCommand } from "../../utils/command-utils";
import * as fs from "fs";
import path from "path";
import { ADVANCED_SETTINGS_FILENAME, COMMAND_CATEGORIES } from "../../utils/constants";
import { useAdvancedSettings } from "../../hooks/useAdvancedSettings";
import { isActionEnabled } from "../../utils/action-utils";
import runModel from "../../utils/runModel";
import * as Insights from "../../utils/insights";
import { defaultAdvancedSettings } from "../../data/default-advanced-settings";

interface CommandFormValues {
  name: string;
  prompt: string;
  icon: string;
  iconColor?: string;
  minNumFiles: string;
  acceptedFileExtensions?: string;
  useMetadata?: boolean;
  useAudioDetails?: boolean;
  useSoundClassification?: boolean;
  useSubjectClassification?: boolean;
  useRectangleDetection?: boolean;
  useBarcodeDetection?: boolean;
  useFaceDetection?: boolean;
  useHorizonDetection?: boolean;
  outputKind?: string;
  actionScript?: string;
  showResponse?: boolean;
  description?: string;
  useSaliencyAnalysis?: boolean;
  author?: string;
  website?: string;
  version?: string;
  requirements?: string;
  scriptKind?: string;
  categories?: string[];
  temperature?: string;
  favorited?: boolean;
  model?: string;
  useSpeech?: boolean;
  speakResponse?: boolean;
  showInMenuBar?: boolean;
  template?: boolean;
}

export default function CommandForm(props: {
  oldData?: Command;
  setCommands?: React.Dispatch<React.SetStateAction<Command[]>>;
  setTemplates?: React.Dispatch<React.SetStateAction<Command[]>>;
  duplicate?: boolean;
}) {
  const { oldData, setCommands, setTemplates, duplicate } = props;
  const { advancedSettings } = useAdvancedSettings();
  const [promptInfo, setPromptInfo] = useState<string>("");
  const [scriptInfo, setScriptInfo] = useState<string>("");
  const models = useModels();
  const [insightMessage, setInsightMessage] = useState<string>("");
  const { pop } = useNavigation();

  const [setupFields, setSetupFields] = useState<
    {
      associatedConfigField: string;
      name: string;
      value: string | boolean;
      placeholder: string;
      info: string;
    }[]
  >([]);
  const [enableSetupEditing, setEnableSetupEditing] = useState<boolean>(oldData != undefined && !oldData.setupLocked);
  const lastAddedFieldRef = useRef<Form.TextField>(null);
  const [currentFieldFocus, setCurrentFieldFocus] = useState<number>(-1);
  let lastFieldContext = "";
  const setupFieldSections = setupFields.reduce((acc, current) => {
    if (!acc.find((entry) => entry[1] == current.associatedConfigField)) {
      return [
        ...acc,
        [
          current.value == undefined || current.value.toString().trim() == ""
            ? `Setup Field ${acc.length + 1}`
            : (current.value as string),
          current.associatedConfigField,
        ],
      ];
    }
    return acc;
  }, [] as string[][]);

  const preferences = getPreferenceValues<ExtensionPreferences>();

  const getDefaultValues = () => {
    try {
      const advancedSettingsValues = JSON.parse(
        fs.readFileSync(path.join(environment.supportPath, ADVANCED_SETTINGS_FILENAME), "utf-8")
      );
      if ("commandDefaults" in advancedSettingsValues) {
        return advancedSettingsValues.commandDefaults;
      }
    } catch (error) {
      console.error(error);
      return defaultAdvancedSettings.commandDefaults;
    }
  };

  useEffect(() => {
    if (!preferences.usePlaceholderStatistics) {
      return;
    }

    const placeholders = Object.values(Placeholders.allPlaceholders).filter((p) =>
      p.name.includes(":") ? Math.random() < 0.05 : true
    );

    // Shuffle the array (to avoid bias)
    for (let i = placeholders.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = placeholders[i];
      placeholders[i] = placeholders[j];
      placeholders[j] = temp;
    }

    Insights.objectsByFrequency("_count", "name", 5).then((mostFrequentPlaceholders) => {
      const modelInput = `I want you to recommend placeholders for me to use based on the following information. First, here are the placeholders that I most frequently use:\n\n${mostFrequentPlaceholders.join(
        "\n"
      )}\n\nNext, here are all of the other placeholders that I know about:\n\n${placeholders
        .filter((p) => !mostFrequentPlaceholders.includes(p.name))
        .map((p) => p.name)
        .join(
          "\n"
        )}\n\nFrom the second list, which placeholders best compliment to the ones that I use most frequently? Output the names of 3 complimentary placeholders, separated by commas. Do not output any other text.`;

      runModel(modelInput, modelInput, "").then((response) => {
        const message = response
          ? `\n\nSuggested Placeholders Based on Your Usage:\n${response
              .split(",")
              .map((p) =>
                Object.values(Placeholders.allPlaceholders).find((placeholder) => placeholder.name == p.trim())
              )
              .map((p) => `\n${p?.hintRepresentation}: ${p?.description}\nExample: ${p?.example}`)
              .join("\n")}`
          : "";
        setInsightMessage(message);
        if (message) {
          Insights.add(
            "Placeholder Suggestions",
            `Your most frequently used placeholders in PromptLab prompts are: ${mostFrequentPlaceholders}. \n\nBased on those, consider using these placeholders: ${response}`,
            ["placeholders"],
            []
          );
        }
      });
    });
  }, []);

  useEffect(() => {
    lastAddedFieldRef.current?.focus();
  }, [currentFieldFocus]);

  useEffect(() => {
    if (oldData) {
      checkForPlaceholders(oldData.prompt).then((includedPlaceholders) => {
        let newPromptInfo = includedPlaceholders.length > 0 ? "\n\nDetected Placeholders:" : "";
        includedPlaceholders.forEach((placeholder) => {
          newPromptInfo =
            newPromptInfo +
            `\n\n${placeholder.hintRepresentation || ""}: ${placeholder.description}\nExample: ${placeholder.example}`;
        });
        setPromptInfo(newPromptInfo);

        checkForPlaceholders(oldData.actionScript || "").then((includedPlaceholders) => {
          let newScriptInfo = includedPlaceholders.length > 0 ? "Detected Placeholders:" : "";
          includedPlaceholders.forEach((placeholder) => {
            newScriptInfo =
              newScriptInfo +
              `\n\n${placeholder.hintRepresentation || ""}: ${placeholder.description}\nExample: ${
                placeholder.example
              }`;
          });
          setScriptInfo(newScriptInfo);
        });
      });
    }

    if (oldData && oldData.setupConfig) {
      const fields = [] as {
        associatedConfigField: string;
        name: string;
        value: string | boolean;
        placeholder: string;
        info: string;
      }[];

      oldData.setupConfig.fields.forEach((field) => {
        const configFieldID = crypto.randomUUID();
        if (enableSetupEditing) {
          fields.push({
            associatedConfigField: configFieldID,
            name: "Field Name",
            value: field.name,
            placeholder: "Name of the field",
            info: "The name of the field to be displayed in the command setup form.",
          });

          fields.push({
            associatedConfigField: configFieldID,
            name: "Description",
            value: field.description,
            placeholder: "What is this field for?",
            info: "A description of what this field is for. This will be displayed as field information in the command setup form.",
          });

          fields.push({
            associatedConfigField: configFieldID,
            name: "Guide Text",
            value: field.guideText,
            placeholder: "Instructions for the user",
            info: "Instructions for the user to follow when filling out this field. This will be displayed as a description above the field in the command setup form.",
          });

          fields.push({
            associatedConfigField: configFieldID,
            name: "Default Value",
            value: field.value || field.defaultValue || "",
            placeholder: "Default value for the field",
            info: "The initial value for the field, if any. Leave blank for no default value.",
          });
        }

        if ("regex" in field && enableSetupEditing) {
          // StringConfigField
          fields.push({
            associatedConfigField: configFieldID,
            name: "Minimum Length",
            value: field.minLength,
            placeholder: "Minimum number of characters",
            info: "The minimum number of characters that must be entered for the field to be valid. Leave blank for no minimum length.",
          });

          fields.push({
            associatedConfigField: configFieldID,
            name: "Maximum Length",
            value: field.maxLength,
            placeholder: "Maximum number of characters",
            info: "The maximum number of characters that can be entered for the field to be valid. Leave blank for no maximum length.",
          });

          fields.push({
            associatedConfigField: configFieldID,
            name: "Regex Test",
            value: field.regex,
            placeholder: "Regular expression to test",
            info: "A regular expression that the field's value must match for it to be valid. Leave blank for no regular expression test.",
          });
        }

        if ("min" in field && enableSetupEditing) {
          fields.push({
            associatedConfigField: configFieldID,
            name: "Minimum Value",
            value: "",
            placeholder: "Minimum allowed value",
            info: "The minimum value that can be entered for the field to be valid. Leave blank for no minimum value.",
          });

          fields.push({
            associatedConfigField: configFieldID,
            name: "Maximum Length",
            value: "",
            placeholder: "Maximum allowed value",
            info: "The maximum value that can be entered for the field to be valid. Leave blank for no maximum value.",
          });
        }

        if (!enableSetupEditing) {
          fields.push({
            associatedConfigField: configFieldID,
            name: field.name == "Default Value" ? "Value" : field.name,
            value:
              "regex" in field || "min" in field
                ? field.value || field.defaultValue || ""
                : field.value || field.defaultValue || false,
            placeholder: field.description,
            info: field.guideText,
          });
        }
      });
      setSetupFields(fields);
    }
  }, [enableSetupEditing]);

  const { handleSubmit, itemProps, values } = useForm<CommandFormValues>({
    async onSubmit(values) {
      if (!values.showResponse) {
        values["outputKind"] = "none";
      }

      let minNumFiles = values.minNumFiles;
      if (minNumFiles == "0") {
        if (
          values.prompt.match(
            /{{(imageText|imageFaces|imageAnimals|imageHorizon|imageSubjects|imageSaliency|imageBarcodes|imageRectangles|pdfRawText|pdfOCRText|contents)}}/g
          ) != null
        ) {
          minNumFiles = "1";
        }
      }

      const commandObj: Command = {
        id: oldData?.id || crypto.randomUUID(),
        name: values.name,
        prompt: values.prompt,
        icon: values.icon,
        iconColor: values.iconColor,
        minNumFiles: minNumFiles,
        acceptedFileExtensions: values.acceptedFileExtensions,
        useMetadata: values.useMetadata,
        useAudioDetails: values.useAudioDetails,
        useSoundClassification: values.useSoundClassification,
        useSubjectClassification: values.useSubjectClassification,
        useRectangleDetection: values.useRectangleDetection,
        useBarcodeDetection: values.useBarcodeDetection,
        useFaceDetection: values.useFaceDetection,
        outputKind: values.outputKind,
        actionScript: values.actionScript,
        showResponse: values.showResponse,
        description: values.description,
        useSaliencyAnalysis: values.useSaliencyAnalysis,
        useHorizonDetection: values.useHorizonDetection,
        author: values.author,
        website: values.website,
        version: values.version,
        requirements: values.requirements,
        scriptKind: values.scriptKind,
        categories: values.categories,
        temperature: values.temperature,
        installedFromStore: oldData ? (oldData.installedFromStore == true ? true : false) : false,
        setupLocked: !enableSetupEditing,
        useSpeech: values.useSpeech,
        speakResponse: values.speakResponse,
        showInMenuBar: values.showInMenuBar,
        favorited: values.favorited,
        template: values.template,
      };

      if (setupFields.length > 0) {
        const commandConfig: CommandConfig = {
          configVersion: "1.0.0",
          fields: [],
        };

        const uniqueFields = setupFields.reduce((acc, current) => {
          if (!acc.includes(current.associatedConfigField)) {
            return acc.concat([current.associatedConfigField]);
          }
          return acc;
        }, [] as string[]);

        if (enableSetupEditing) {
          uniqueFields.forEach((field) => {
            const newField: NumberConfigField | BooleanConfigField | StringConfigField | object = {};
            setupFields.forEach((setupField) => {
              if (setupField.associatedConfigField == field) {
                switch (setupField.name) {
                  case "Field Name":
                    (newField as NumberConfigField | BooleanConfigField | StringConfigField).name =
                      setupField.value as string;
                    break;
                  case "Description":
                    (newField as NumberConfigField | BooleanConfigField | StringConfigField).description =
                      setupField.value as string;
                    break;
                  case "Guide Text":
                    (newField as NumberConfigField | BooleanConfigField | StringConfigField).guideText =
                      setupField.value as string;
                    break;
                  case "Default Value":
                    (newField as NumberConfigField | BooleanConfigField | StringConfigField).defaultValue =
                      setupField.value;
                    break;
                  case "Minimum Length":
                    (newField as StringConfigField).minLength = setupField.value as string;
                    break;
                  case "Maximum Length":
                    (newField as StringConfigField).maxLength = setupField.value as string;
                    break;
                  case "Regex Test":
                    (newField as StringConfigField).regex = setupField.value as string;
                    break;
                  case "Minimum Value":
                    (newField as NumberConfigField).min = setupField.value as string;
                    break;
                  case "Maximum Value":
                    (newField as NumberConfigField).max = setupField.value as string;
                    break;
                }
              }
            });
            if (oldData && oldData.setupConfig) {
              const oldField = oldData.setupConfig.fields.find(
                (field) => field.name == (newField as NumberConfigField | BooleanConfigField | StringConfigField).name
              );
              if (oldField) {
                (newField as NumberConfigField | BooleanConfigField | StringConfigField).value = oldField.value;
              }
            }
            commandConfig.fields.push(newField as NumberConfigField | BooleanConfigField | StringConfigField);
          });
        } else {
          setupFields.forEach((field) => {
            if (oldData && oldData.setupConfig) {
              const oldField = oldData.setupConfig.fields.find((field) => field.name == field.name);
              const newField = { ...oldField, value: field.value };
              const newFields = [
                ...oldData.setupConfig.fields
                  .map((field) => ({ ...field }))
                  .filter((field) => field.name != field.name),
                newField,
              ];
              commandConfig.fields = newFields as (NumberConfigField | BooleanConfigField | StringConfigField)[];
            }
          });
        }
        commandObj.setupConfig = commandConfig;
      }

      await updateCommand(oldData, commandObj, setCommands, setTemplates);
      if (values.template) {
        await showToast({ title: "Template Saved" });
      } else {
        if (oldData && !duplicate) {
          await showToast({ title: "Command Saved" });
        } else {
          await showToast({ title: "Added PromptLab Command" });
        }
      }
      pop();
    },
    initialValues: oldData || getDefaultValues(),
    validation: {
      name: FormValidation.Required,
      prompt: (value) => {
        if (!value) {
          return "Must provide a prompt";
        }
      },
      minNumFiles: (value) => {
        if (!value) {
          return "Must specify minimum number of files";
        }

        const num = parseInt(value);
        if (num == undefined || num < 0) {
          return "Invalid number";
        }
      },
    },
  });

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={oldData && !duplicate ? "Save Command" : "Create Command"}
            icon={Icon.PlusSquare}
            onSubmit={handleSubmit}
          />
          <Action.SubmitForm
            title="Save As Template"
            onSubmit={async (values) => {
              values.template = true;
              await handleSubmit(values as CommandFormValues);
            }}
            icon={Icon.Center}
          />
          <OpenPlaceholdersGuideAction settings={advancedSettings} />
          <EditCustomPlaceholdersAction settings={advancedSettings} />
          {isActionEnabled("ToggleSetupFieldsAction", advancedSettings) ? (
            <Action
              title={enableSetupEditing ? "Lock Setup Fields" : "Unlock Setup Fields"}
              icon={enableSetupEditing ? Icon.Lock : Icon.LockUnlocked}
              shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
              onAction={async () => {
                const currentValue = enableSetupEditing;
                setEnableSetupEditing(!enableSetupEditing);
                await showToast({
                  title: `Setup Fields ${currentValue ? "Locked" : "Unlocked"}`,
                  message: `Setup fields are now ${
                    currentValue
                      ? "locked, meaning that you cannot configure their parameters apart from the current value."
                      : "unlocked, meaning that you can edit their parameters, but not their active value."
                  }`,
                });
              }}
            />
          ) : null}
          <OpenAdvancedSettingsAction settings={advancedSettings} />

          {enableSetupEditing ? (
            <>
              <ActionPanel.Section title="Add Setup Fields">
                <Action
                  title="Add Text Entry Field"
                  icon={Icon.TextInput}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "t" }}
                  onAction={() => {
                    const fields = [...setupFields];
                    const configFieldID = crypto.randomUUID();
                    fields.push({
                      associatedConfigField: configFieldID,
                      name: "Field Name",
                      value: "",
                      placeholder: "Name of the field",
                      info: "The name of the field to be displayed in the command setup form.",
                    });

                    fields.push({
                      associatedConfigField: configFieldID,
                      name: "Description",
                      value: "",
                      placeholder: "What is this field for?",
                      info: "A description of what this field is for. This will be displayed as field information in the command setup form.",
                    });

                    fields.push({
                      associatedConfigField: configFieldID,
                      name: "Guide Text",
                      value: "",
                      placeholder: "Instructions for the user",
                      info: "Instructions for the user to follow when filling out this field. This will be displayed as a description above the field in the command setup form.",
                    });

                    fields.push({
                      associatedConfigField: configFieldID,
                      name: "Default Value",
                      value: "",
                      placeholder: "Default value for the field",
                      info: "The initial value for the field, if any. Leave blank for no default value.",
                    });

                    fields.push({
                      associatedConfigField: configFieldID,
                      name: "Minimum Length",
                      value: "",
                      placeholder: "Minimum number of characters",
                      info: "The minimum number of characters that must be entered for the field to be valid. Leave blank for no minimum length.",
                    });

                    fields.push({
                      associatedConfigField: configFieldID,
                      name: "Maximum Length",
                      value: "",
                      placeholder: "Maximum number of characters",
                      info: "The maximum number of characters that can be entered for the field to be valid. Leave blank for no maximum length.",
                    });

                    fields.push({
                      associatedConfigField: configFieldID,
                      name: "Regex Test",
                      value: "",
                      placeholder: "Regular expression to test",
                      info: "A regular expression that the field's value must match for it to be valid. Leave blank for no regular expression test.",
                    });
                    setSetupFields(fields);
                    setCurrentFieldFocus(fields.length - 7);
                  }}
                />
                <Action
                  title="Add Number Entry Field"
                  icon={Icon.Hashtag}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "n" }}
                  onAction={() => {
                    const fields = [...setupFields];
                    const configFieldID = crypto.randomUUID();
                    fields.push({
                      associatedConfigField: configFieldID,
                      name: "Field Name",
                      value: "",
                      placeholder: "Name of the field",
                      info: "The name of the field to be displayed in the command setup form.",
                    });

                    fields.push({
                      associatedConfigField: configFieldID,
                      name: "Description",
                      value: "",
                      placeholder: "What is this field for?",
                      info: "A description of what this field is for. This will be displayed as field information in the command setup form.",
                    });

                    fields.push({
                      associatedConfigField: configFieldID,
                      name: "Guide Text",
                      value: "",
                      placeholder: "Instructions for the user",
                      info: "Instructions for the user to follow when filling out this field. This will be displayed as a description above the field in the command setup form.",
                    });

                    fields.push({
                      associatedConfigField: configFieldID,
                      name: "Default Value",
                      value: "",
                      placeholder: "Default value for the field",
                      info: "The initial value for the field, if any. Leave blank for no default value.",
                    });

                    fields.push({
                      associatedConfigField: configFieldID,
                      name: "Minimum Value",
                      value: "",
                      placeholder: "Minimum allowed value",
                      info: "The minimum value that can be entered for the field to be valid. Leave blank for no minimum value.",
                    });

                    fields.push({
                      associatedConfigField: configFieldID,
                      name: "Maximum Length",
                      value: "",
                      placeholder: "Maximum allowed value",
                      info: "The maximum value that can be entered for the field to be valid. Leave blank for no maximum value.",
                    });
                    setSetupFields(fields);
                    setCurrentFieldFocus(fields.length - 6);
                  }}
                />
                <Action
                  title="Add Boolean Selection Field"
                  icon={Icon.LightBulbOff}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "b" }}
                  onAction={() => {
                    const fields = [...setupFields];
                    const configFieldID = crypto.randomUUID();
                    fields.push({
                      associatedConfigField: configFieldID,
                      name: "Field Name",
                      value: "",
                      placeholder: "Name of the field",
                      info: "The name of the field to be displayed in the command setup form.",
                    });

                    fields.push({
                      associatedConfigField: configFieldID,
                      name: "Description",
                      value: "",
                      placeholder: "What is this field for?",
                      info: "A description of what this field is for. This will be displayed as field information in the command setup form.",
                    });

                    fields.push({
                      associatedConfigField: configFieldID,
                      name: "Guide Text",
                      value: "",
                      placeholder: "Instructions for the user",
                      info: "Instructions for the user to follow when filling out this field. This will be displayed as a description above the field in the command setup form.",
                    });

                    fields.push({
                      associatedConfigField: configFieldID,
                      name: "Default Value",
                      value: false,
                      placeholder: "Default value for the field",
                      info: "The initial value for the field, if any. Leave blank for no default value.",
                    });
                    setSetupFields(fields);
                    setCurrentFieldFocus(fields.length - 4);
                  }}
                />
              </ActionPanel.Section>

              {setupFieldSections.length > 0 ? (
                <ActionPanel.Section title="Remove Setup Fields">
                  {setupFieldSections.map((section) => {
                    const sectionName = section[0];
                    return (
                      <Action
                        title={`Delete ${sectionName}`}
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        key={`removeField-${sectionName}`}
                        onAction={async () => {
                          const fields = [...setupFields.map((field) => ({ ...field }))].filter(
                            (field) => field.associatedConfigField != section[1]
                          );
                          setSetupFields(fields);
                          setCurrentFieldFocus(-1);
                          await showToast({ title: `Deleted ${sectionName}` });
                        }}
                      />
                    );
                  })}
                </ActionPanel.Section>
              ) : null}
            </>
          ) : null}
        </ActionPanel>
      }
    >
      <Form.Description title="Name & Icon" text="Give your command a memorable name and an icon to match." />

      <Form.TextField title="Command Name" placeholder="Name of PromptLab Command" {...itemProps.name} />

      <Form.Dropdown title="Icon" {...itemProps.icon}>
        {Object.keys(Icon).map((iconName, index) => (
          <Form.Dropdown.Item
            title={iconName}
            value={Object.values(Icon)[index]}
            key={iconName}
            icon={Object.values(Icon)[index]}
          />
        ))}
      </Form.Dropdown>

      <Form.Dropdown title="Icon Color" {...itemProps.iconColor}>
        <Form.Dropdown.Item
          title="Default For Category"
          value="defaultForCategory"
          icon={{
            source: Icon.Circle,
            tintColor:
              COMMAND_CATEGORIES.find((category) => category.name == values.categories?.[0])?.color ||
              Color.PrimaryText,
          }}
        />
        <Form.Dropdown.Item
          title={environment.appearance == "dark" ? "White" : "Black"}
          value={Color.PrimaryText}
          icon={{ source: Icon.CircleFilled, tintColor: Color.PrimaryText }}
        />
        <Form.Dropdown.Item title="Red" value={Color.Red} icon={{ source: Icon.CircleFilled, tintColor: Color.Red }} />
        <Form.Dropdown.Item
          title="Orange"
          value={Color.Orange}
          icon={{ source: Icon.CircleFilled, tintColor: Color.Orange }}
        />
        <Form.Dropdown.Item
          title="Yellow"
          value={Color.Yellow}
          icon={{ source: Icon.CircleFilled, tintColor: Color.Yellow }}
        />
        <Form.Dropdown.Item
          title="Green"
          value={Color.Green}
          icon={{ source: Icon.CircleFilled, tintColor: Color.Green }}
        />
        <Form.Dropdown.Item
          title="Blue"
          value={Color.Blue}
          icon={{ source: Icon.CircleFilled, tintColor: Color.Blue }}
        />
        <Form.Dropdown.Item
          title="Purple"
          value={Color.Purple}
          icon={{ source: Icon.CircleFilled, tintColor: Color.Purple }}
        />
        <Form.Dropdown.Item
          title="Magenta"
          value={Color.Magenta}
          icon={{ source: Icon.CircleFilled, tintColor: Color.Magenta }}
        />
      </Form.Dropdown>

      <Form.Checkbox
        label="Show In Menu Bar"
        {...itemProps.showInMenuBar}
        info="If checked, the command will appear in PromptLab's menu bar menu, if enabled."
      />

      <Form.Checkbox
        label="Favorite"
        {...itemProps.favorited}
        info="Mark this command as a favorite. Favorited commands will appear at the top of the command list."
      />

      <Form.Separator />

      <Form.TextArea
        title="Prompt"
        placeholder="Instructions for AI to follow"
        info={`This is the prompt that the AI will use to generate a response. You can use placeholders to add dynamic content to your prompt. Use the 'Open Placeholders Guide' action to learn more. ${
          promptInfo ? promptInfo : insightMessage
        }`}
        {...itemProps.prompt}
        onChange={async (value) => {
          itemProps.prompt.onChange?.(value);
          const includedPlaceholders = await checkForPlaceholders(value);
          let newPromptInfo = includedPlaceholders.length > 0 ? "\n\nDetected Placeholders:" : "";
          includedPlaceholders.forEach((placeholder) => {
            newPromptInfo =
              newPromptInfo +
              `\n\n${placeholder.hintRepresentation || ""}: ${placeholder.description}\nExample: ${
                placeholder.example
              }`;
          });
          setPromptInfo(newPromptInfo);
        }}
      />

      <Form.TextArea
        title="Script"
        placeholder="Script to run after response is received"
        info={`Code for the script to run after receiving a response to the prompt. Use the 'response' variable to access the text of the response. ${
          scriptInfo ? scriptInfo : insightMessage
        }`}
        {...itemProps.actionScript}
        onChange={async (value) => {
          itemProps.actionScript.onChange?.(value);
          const includedPlaceholders = await checkForPlaceholders(value);
          let newScriptInfo = includedPlaceholders.length > 0 ? "Detected Placeholders:" : "";
          includedPlaceholders.forEach((placeholder) => {
            newScriptInfo =
              newScriptInfo +
              `\n\n${placeholder.hintRepresentation || ""}: ${placeholder.description}\nExample: ${
                placeholder.example
              }`;
          });
          setScriptInfo(newScriptInfo);
        }}
      />

      <Form.Dropdown title="Script Kind" info="The type of script used in the Script field." {...itemProps.scriptKind}>
        <Form.Dropdown.Item title="AppleScript" value="applescript" icon={Icon.Paragraph} />
        <Form.Dropdown.Item title="Shell (ZSH)" value="zsh" icon={Icon.Terminal} />
      </Form.Dropdown>

      <Form.Separator />

      <Form.Description title="Settings" text="Customize the way your command works and what data is accesses." />

      {values.showResponse ? (
        <Form.Dropdown
          title="Output View"
          info="The view in which the command's output will be rendered. Detail is the most likely to work for any given command, but PromptLab will do its best to give you usable output no matter what."
          {...itemProps.outputKind}
        >
          <Form.Dropdown.Item title="Detail" value="detail" icon={Icon.AppWindow} />
          <Form.Dropdown.Item title="List" value="list" icon={Icon.List} />
          <Form.Dropdown.Item title="Grid" value="grid" icon={Icon.Message} />
          <Form.Dropdown.Item title="Chat" value="chat" icon={Icon.Message} />
          <Form.Dropdown.Item title="Dialog Window" value="dialogWindow" icon={Icon.List} />
        </Form.Dropdown>
      ) : null}

      <Form.Checkbox
        label="Show Response View"
        {...itemProps.showResponse}
        info="If checked, the AI's output will be displayed in Raycast. Disabling this is only useful if you provide an action script."
      />

      <Form.Checkbox
        title="Speech"
        label="Speak Response"
        {...itemProps.speakResponse}
        info="If checked, the output of the command will be spoken aloud by your computer using the system's text-to-speech engine. An action to stop speech will be added to the command's action panel."
      />

      <Form.Checkbox
        label="Speak Input"
        {...itemProps.useSpeech}
        info="If checked, the command will accept speech input from the user prior to running the prompt. The speech input can be accessed using the {{input}} placeholder."
      />

      <Form.TextField
        title="Minimum File Count"
        placeholder="Minimum number of files required"
        info="The minimum number of files that must be selected for the command to be run."
        {...itemProps.minNumFiles}
      />

      <Form.TextArea
        title="Accepted File Extensions"
        placeholder="Comma-separated list of file extensions, e.g. txt, csv, html"
        info="A list of file extensions that will be accepted by the command. If left blank, all files will be accepted."
        {...itemProps.acceptedFileExtensions}
      />

      {preferences.includeTemperature ? (
        <Form.TextField
          title="Creativity"
          placeholder="Value between 0.0 and 2.0"
          info="A measure of the level of the randomness and creativity in the model's output. Higher values will result in more creative output, but may be less relevant to the prompt. Value must be between 0.0 and 2.0."
          {...itemProps.temperature}
        />
      ) : null}

      <Form.Dropdown title="Model" info="The model to use for this command." {...itemProps.model}>
        {models.models.some((model) => model.favorited) ? (
          <Form.Dropdown.Section title="Favorites">
            {models.models
              .filter((model) => model.favorited)
              .map((model) => (
                <Form.Dropdown.Item
                  title={model.name}
                  value={model.id}
                  key={model.id}
                  icon={{ source: model.icon, tintColor: model.iconColor }}
                />
              ))}
          </Form.Dropdown.Section>
        ) : null}
        {models.models
          .filter((model) => !model.favorited)
          .map((model) => (
            <Form.Dropdown.Item
              title={model.name}
              value={model.id}
              key={model.id}
              icon={{ source: model.icon, tintColor: model.iconColor }}
            />
          ))}
      </Form.Dropdown>

      <Form.Checkbox
        title="Included Information"
        label="Use File Metadata"
        {...itemProps.useMetadata}
        info="If checked, metadata of selected files will be included in the text provided to the AI, and additional EXIF data will be included for image files."
      />

      <Form.Checkbox
        label="Use Subject Classifications"
        {...itemProps.useSubjectClassification}
        info="If checked, subject classification labels will be included in the text provided to the AI when acting on image files."
      />

      <Form.Checkbox
        label="Use Sound Classifications"
        {...itemProps.useSoundClassification}
        info="If checked, sound classification labels will be included in the text provided to the AI when acting on audio files."
      />

      <Form.Checkbox
        label="Use Transcribed Audio"
        {...itemProps.useAudioDetails}
        info="If checked, transcribed text will be provided to the AI when acting on audio files."
      />

      <Form.Checkbox
        label="Use Barcode Detection"
        {...itemProps.useBarcodeDetection}
        info="If checked, the payload text of any barcodes and QR codes in images will be included in the text provided to the AI."
      />

      <Form.Checkbox
        label="Use Rectangle Detection"
        {...itemProps.useRectangleDetection}
        info="If checked, the size and position of rectangles in image files with be included in the text provided to the AI."
      />

      <Form.Checkbox
        label="Use Face Detection"
        {...itemProps.useFaceDetection}
        info="If checked, the number of faces in image files will be included in the text provided to the AI."
      />

      <Form.Checkbox
        label="Use Horizon Detection"
        {...itemProps.useHorizonDetection}
        info="If checked, the angle of the horizon in image files will be included in the text provided to the AI."
      />

      <Form.Checkbox
        label="Use Saliency Analysis"
        {...itemProps.useSaliencyAnalysis}
        info="If checked, the areas of an image most likely to draw attention will be included in the text provided to the AI."
      />

      <Form.Separator />

      <Form.Description
        title="Command Metadata"
        text="Information about the command for when you share it or upload it to the command store."
      />
      <Form.TextField
        title="Author"
        placeholder="Your name or username"
        info="An optional name or username that others can attribute the command to. If you upload the command to the store, this will be displayed on the command's page."
        {...itemProps.author}
      />
      <Form.TextField
        title="Website"
        placeholder="Your website"
        info="An optional website URL that others can visit to learn more about the command. If you upload the command to the store, this will be displayed on the command's page."
        {...itemProps.website}
      />
      <Form.TextField
        title="Command Version"
        placeholder="The version of the command"
        info="An optional version number for the command. If you upload the command to the store, this will be displayed on the command's page."
        {...itemProps.version}
      />
      <Form.TextArea
        title="Description"
        placeholder="Description of what this command does"
        info="A description of what this command does. Useful if you plan to share the command with others."
        {...itemProps.description}
      />
      <Form.TextArea
        title="Requirements"
        placeholder="Any requirements for the command"
        info="A list or paragraph explaining any requirements for this script, e.g. other commands, command-line utilities, etc."
        {...itemProps.requirements}
      />
      <Form.TagPicker
        title="Categories"
        info="A comma-separated list of categories for the command. This will be used to help users find your command in the store and in their prompt library."
        {...itemProps.categories}
      >
        {COMMAND_CATEGORIES.map((category) => (
          <Form.TagPicker.Item
            key={category.name}
            title={category.name}
            value={category.name}
            icon={{ source: category.icon, tintColor: category.color }}
          />
        ))}
      </Form.TagPicker>

      {setupFields.length > 0 ? <Form.Separator /> : null}
      {setupFields.length > 0 ? (
        <Form.Description title="Config Options" text="Customization options for this command." />
      ) : null}
      {setupFields.map((field, index) => {
        let showSeparator = false;
        const sectionIndex = setupFieldSections.findIndex((section) => section[1] == field.associatedConfigField);
        if (lastFieldContext != field.associatedConfigField && sectionIndex != 0 && enableSetupEditing) {
          showSeparator = true;
          lastFieldContext = field.associatedConfigField;
        }

        const isBoolean =
          setupFields
            .filter((f) => f.associatedConfigField == field.associatedConfigField)
            .find((f) => {
              return f.name == "Regex Test" || f.name == "Minimum Value";
            }) == undefined;

        if (!enableSetupEditing) {
          return (
            <Fragment key={`fragment${field.associatedConfigField}${index}`}>
              {showSeparator ? <Form.Separator key={`separator${field.associatedConfigField}${index}`} /> : null}
              <Form.Description
                title={field.name}
                text={field.info || ""}
                key={`setupFieldDescriptions${field.associatedConfigField}${index}`}
              />
              {field.name == "Value" && isBoolean ? (
                <Form.Checkbox
                  label={field.name}
                  info={field.placeholder}
                  key={`${field.associatedConfigField}${index}`}
                  id={`${field.associatedConfigField}${field.name}`}
                  defaultValue={field.value as boolean}
                  onChange={(value) => {
                    const fields = [...setupFields.map((field) => ({ ...field }))];
                    fields[index].value = value;
                    setSetupFields(fields);
                  }}
                />
              ) : (
                <Form.TextField
                  title={field.name}
                  placeholder="Value for the field"
                  info={field.placeholder}
                  key={`${field.associatedConfigField}${index}`}
                  id={`${field.associatedConfigField}${field.name}`}
                  defaultValue={field.value as string}
                  onChange={(value) => {
                    const fields = [...setupFields.map((field) => ({ ...field }))];
                    fields[index].value = value;
                    setSetupFields(fields);
                  }}
                />
              )}
            </Fragment>
          );
        }

        if (field.name == "Default Value" && isBoolean) {
          return (
            <Fragment key={`fragment${field.associatedConfigField}${index}`}>
              {showSeparator ? <Form.Separator key={`separator${field.associatedConfigField}${index}`} /> : null}
              <Form.Checkbox
                title={field.name}
                label={field.value ? "True" : "False"}
                info={field.info}
                key={`${field.associatedConfigField}${index}`}
                id={`${field.associatedConfigField}${field.name}`}
                defaultValue={field.value as boolean}
                onChange={(value) => {
                  const fields = [...setupFields];
                  fields[index].value = value;
                  setSetupFields(fields);
                }}
              />
            </Fragment>
          );
        } else {
          return (
            <Fragment key={`fragment${field.associatedConfigField}${index}`}>
              {showSeparator ? <Form.Separator key={`separator${field.associatedConfigField}${index}`} /> : null}
              <Form.TextField
                title={field.name}
                placeholder={field.placeholder}
                info={field.info}
                key={`${field.associatedConfigField}${index}`}
                id={`${field.associatedConfigField}${field.name}`}
                defaultValue={field.value as string}
                ref={index == currentFieldFocus ? lastAddedFieldRef : null}
                onChange={(value) => {
                  const fields = [...setupFields];
                  fields[index].value = value;
                  setSetupFields(fields);
                }}
              />
            </Fragment>
          );
        }
      })}
    </Form>
  );
}
