/* eslint-disable @typescript-eslint/no-unused-vars */ // Disable since many placeholder functions have unused parameters that are kept for consistency.
import {
  LocalStorage,
  environment,
  getFrontmostApplication,
  getPreferenceValues,
  getSelectedText,
  open,
  showHUD,
  showToast,
} from "@raycast/api";
import { Clipboard } from "@raycast/api";
import { runAppleScript } from "run-applescript";
import {
  filterString,
  getAlbumNames,
  getArtistNames,
  getComputerName,
  getCurrentTrack,
  getCurrentURL,
  getDirectorNames,
  getInstalledApplications,
  getJSONResponse,
  getLastEmail,
  getLastNote,
  getMatchingYouTubeVideoID,
  getPlaylistNames,
  getSafariBookmarks,
  getSafariTabText,
  getSafariTopSites,
  getShowNames,
  getTextOfWebpage,
  getTrackNames,
  getURLHTML,
  getWeatherData,
  getYouTubeVideoTranscriptById,
  getYouTubeVideoTranscriptByURL,
  runJSInActiveTab,
} from "./context-utils";
import * as fs from "fs";
import * as os from "os";
import * as crypto from "crypto";
import * as vm from "vm";
import { execSync } from "child_process";
import { CUSTOM_PLACEHOLDERS_FILENAME, StorageKeys } from "./constants";
import { getStorage, loadAdvancedSettingsSync, setStorage } from "./storage-utils";
import { ScriptRunner, addFileToSelection, getRunningApplications, searchNearbyLocations } from "./scripts";
import { getExtensions } from "./file-utils";
import runModel from "./runModel";
import {
  audioFileExtensions,
  imageFileExtensions,
  textFileExtensions,
  videoFileExtensions,
} from "../data/file-extensions";
import path from "path";
import {
  CalendarDuration,
  CustomPlaceholder,
  EventType,
  ExtensionPreferences,
  Insight,
  PersistentVariable,
  Placeholder,
  PlaceholderList,
} from "./types";
import * as Insights from "./insights";

/**
 * Placeholder specification.
 */
const placeholders: PlaceholderList = {
  /**
   * Directive to reset the value of a persistent variable to its initial value. If the variable does not exist, nothing will happen. The placeholder will always be replaced with an empty string.
   */
  "{{reset [a-zA-Z0-9_]+}}": {
    name: "reset",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const matches = str.match(/{{reset ([a-zA-Z0-9_]+)}}/);
      if (matches) {
        const key = matches[1];
        const initialValue = await resetPersistentVariable(key);
        await setPersistentVariable(key, initialValue);
      }
      return { result: "" };
    },
    constant: false,
    fn: async (id: string) =>
      (await Placeholders.allPlaceholders["{{reset [a-zA-Z0-9_]+}}"].apply(`{{reset ${id}}}`)).result,
    example: "{{reset storedText}}",
    description:
      "Resets the value of a persistent variable to its initial value. If the variable does not exist, nothing will happen. Replaced with an empty string.",
    hintRepresentation: "{{reset x}}",
  },

  /**
   * Directive to get the value of a persistent variable. If the variable does not exist, the placeholder will be replaced with an empty string.
   */
  "{{get [a-zA-Z0-9_]+}}": {
    name: "get",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const matches = str.match(/{{get ([a-zA-Z0-9_]+)}}/);
      if (matches) {
        const key = matches[1];
        return { result: (await getPersistentVariable(key)) || "" };
      }
      return { result: "" };
    },
    constant: false,
    fn: async (id: string) =>
      (await Placeholders.allPlaceholders["{{get [a-zA-Z0-9_]+}}"].apply(`{{get ${id}}}`)).result,
    example: "Summarize this: {{get storedText}}",
    description:
      "Replaced with the value of a persistent variable. If the variable has not been set, the placeholder will be replaced with an empty string.",
    hintRepresentation: "{{get x}}",
  },

  /**
   * Directive to delete a persistent variable. If the variable does not exist, nothing will happen. The placeholder will always be replaced with an empty string.
   */
  "{{delete [a-zA-Z0-9_]+}}": {
    name: "delete",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const matches = str.match(/{{delete ([a-zA-Z0-9_]+)}}/);
      if (matches) {
        const key = matches[1];
        await deletePersistentVariable(key);
      }
      return { result: "" };
    },
    constant: false,
    fn: async (id: string) =>
      (await Placeholders.allPlaceholders["{{delete [a-zA-Z0-9_]+}}"].apply(`{{delete ${id}}}`)).result,
    example: "{{delete storedText}}",
    description:
      "Deletes a persistent variable. If the variable does not exist, nothing will happen. Replaced with an empty string.",
    hintRepresentation: "{{delete x}",
  },

  /**
   * Placeholder for a comma-separated list of all persistent variable names.
   */
  "{{vars}}": {
    name: "vars",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const vars: PersistentVariable[] = await getStorage(StorageKeys.PERSISTENT_VARIABLES);
      if (Array.isArray(vars)) {
        const varNames = vars.map((v) => v.name);
        return { result: varNames.join(", "), vars: varNames.join(", ") };
      }
      return { result: "", vars: "" };
    },
    result_keys: ["vars"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{vars}}"].apply("{{vars}}")).result,
    example: "List these alphabetically: {{vars}}",
    description:
      "Replaced with a comma-separated list of all persistent variables. If no persistent variables have been set, the placeholder will be replaced with an empty string.",
    hintRepresentation: "{{vars}}",
  },

  /**
   * Placeholder for the text of the last 50 insights.
   */
  "{{insights(:(.*?))?}}": {
    name: "insights",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const tag = str.match(/{{insights:(.*?)}}/)?.[1];
      let insights: Insight[] = [];
      if (tag) {
        insights = await Insights.get(50, tag);
      } else {
        insights = await Insights.get(50);
      }

      if (insights.length == 0) {
        return { result: "" };
      }

      const recentInsights = insights.slice(0, 50);
      const recentInsightData = recentInsights
        .map(
          (insight) =>
            `${insight.title} on ${insight.date}, description: '${insight.description}' tags: ${insight.tags.join(
              ", "
            )}`
        )
        .join("\n");
      return { result: filterString(recentInsightData) };
    },
    constant: false,
    fn: async (tag?: string) =>
      (await Placeholders.allPlaceholders["{{insights(:(.*?))?}}"].apply(`{{insights${tag ? `:${tag}` : ""}}}`)).result,
    example: "Summarize these data entries: {{insights}}",
    description:
      "Replaced with local data entries, one per line. If a tag is specified, only data entries with that tag will be included.",
    hintRepresentation: "{{insights}}",
  },

  /**
   * Placeholder for the current input to the command. Depending on the circumstances of the command's invocation, this could be the selected text, the parameter of a QuickLink, or direct input via method call.
   */
  "{{input}}": {
    name: "input",
    apply: async (str: string, context?: { [key: string]: string }) => {
      let input = context && "input" in context ? context["input"] : "";
      try {
        input = await getSelectedText();
      } catch (error) {
        input = "";
      }
      return { result: input, input: input };
    },
    result_keys: ["input"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{input}}"].apply("{{input}}")).result,
    example: "Summarize this: {{input}}",
    description:
      "Replaced with the current input to the command. Depending on the circumstances of the command's invocation, this could be the selected text, the parameter of a QuickLink, or direct input via method call.",
    hintRepresentation: "{{input}}",
  },

  /**
   * Placeholder for the text currently stored in the clipboard. If the clipboard is empty, this will be replaced with an empty string. Most clipboard content supplies a string format, such as file names when copying files in Finder.
   */
  "{{clipboardText}}": {
    name: "clipboardText",
    aliases: ["{{clipboard}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      try {
        const text = (await Clipboard.readText()) || "";
        return { result: text, clipboardText: text };
      } catch (e) {
        return { result: "", clipboardText: "" };
      }
    },
    result_keys: ["clipboardText"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{clipboardText}}"].apply("{{clipboardText}}")).result,
    example: "Summarize this: {{clipboardText}}",
    description:
      "Replaced with the text currently stored in the clipboard. If the clipboard is empty, this will be replaced with an empty string. Most clipboard content supplies a string format, such as file names when copying files in Finder.",
    hintRepresentation: "{{clipboardText}}",
  },

  /**
   * Placeholder for the currently selected text. If no text is selected, this will be replaced with an empty string.
   */
  "{{selectedText}}": {
    name: "selectedText",
    apply: async (str: string, context?: { [key: string]: string }) => {
      try {
        const text = await getSelectedText();
        return { result: text, selectedText: text };
      } catch (e) {
        return { result: "", selectedText: "" };
      }
    },
    result_keys: ["selectedText"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{selectedText}}"].apply("{{selectedText}}")).result,
    example: "Rewrite this as a list: {{selectedText}}",
    description:
      "Replaced with the currently selected text. If no text is selected, this will be replaced with an empty string.",
    hintRepresentation: "{{selectedText}}",
  },

  /**
   * Placeholder for the paths of the currently selected files in Finder as a comma-separated list. If no files are selected, this will be replaced with an empty string.
   */
  "{{selectedFiles}}": {
    name: "selectedFiles",
    aliases: ["{{selectedFile}}", "{{files}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (!context || !("selectedFiles" in context)) return { result: "", selectedFiles: "" };
      try {
        const files =
          context && "selectedFiles" in context ? context["selectedFiles"] : (await ScriptRunner.SelectedFiles()).csv;
        return { result: files, selectedFiles: files };
      } catch (e) {
        return { result: "", selectedFiles: "" };
      }
    },
    result_keys: ["selectedFiles"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{selectedFiles}}"].apply("{{selectedFiles}}")).result,
    example: "Count the number of text files in this list: {{selectedFiles}}",
    description:
      "Replaced with the paths of the currently selected files in Finder as a comma-separated list. If no files are selected, this will be replaced with an empty string.",
    hintRepresentation: "{{selectedFiles}}",
  },

  /**
   * Place holder for the names of the currently selected files in Finder as a comma-separated list.
   */
  "{{fileNames}}": {
    name: "fileNames",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const files =
        context && "selectedFiles" in context ? context["selectedFiles"] : (await ScriptRunner.SelectedFiles()).csv;
      if (files.length == 0) return { result: "", fileNames: "", selectedFiles: "" };
      const fileNames = files
        .split(", ")
        .map((file) => file.split("/").pop())
        .join(", ");
      return { result: fileNames, fileNames: fileNames, selectedFiles: files };
    },
    result_keys: ["fileNames", "selectedFiles"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{fileNames}}"].apply("{{fileNames}}")).result,
    example: "Sort this list of files by name: {{fileNames}}",
    description:
      "Replaced with the names of the currently selected files in Finder as a comma-separated list. If no files are selected, this will be replaced with an empty string.",
    hintRepresentation: "{{fileNames}}",
  },

  /**
   * Placeholder for metadata of the currently selected files in Finder as a comma-separated list.
   */
  "{{metadata}}": {
    name: "metadata",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const files = (
        context && "selectedFiles" in context ? context["selectedFiles"] : (await ScriptRunner.SelectedFiles()).csv
      ).split(", ");
      const metadata =
        context && "metadata" in context
          ? context["metadata"]
          : files
              .map((file) => {
                const fileMetadata = Object.entries(fs.lstatSync(file))
                  .map(([key, value]) => `${key}:${value}`)
                  .join("\n");
                return `${file}:\n${fileMetadata}`;
              })
              .join("\n\n");
      return { result: metadata, metadata: metadata, selectedFiles: files.join(", ") };
    },
    result_keys: ["metadata", "selectedFiles"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{metadata}}"].apply("{{metadata}}")).result,
    example: "Which of these has the largest filesize? {{metadata}}",
    description:
      "Replaced with metadata of the currently selected files in Finder as a comma-separated list. If no files are selected, this will be replaced with an empty string.",
    hintRepresentation: "{{metadata}}",
  },

  /**
   * Placeholder for all text extracted from selected images in Finder.
   */
  "{{imageText}}": {
    name: "imageText",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const imageText = context && "imageText" in context ? context["imageText"] : "";
      return { result: imageText, imageText: imageText };
    },
    result_keys: ["imageText"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{imageText}}"].apply("{{imageText}}")).result,
    example:
      "Based on the following text extracted from an image, tell me what the image is about. Here's the text: ###{{imageText}}###",
    description:
      "Replaced with all text extracted from selected images in Finder. If no images are selected, or if no text can be extracted from the selected images, this will be replaced with an empty string.",
    hintRepresentation: "{{imageText}}",
  },

  /**
   * Placeholder for the number of faces detected in selected images in Finder.
   */
  "{{imageFaces}}": {
    name: "imageFaces",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const imageFaces = context && "imageFaces" in context ? context["imageFaces"] : "";
      return { result: imageFaces, imageFaces: imageFaces };
    },
    result_keys: ["imageFaces"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{imageFaces}}"].apply("{{imageFaces}}")).result,
    example: "Is {{imageFaces}} a lot of faces?",
    description: "Replaced with the number of faces detected in selected images in Finder.",
    hintRepresentation: "{{imageFaces}}",
  },

  /**
   * Placeholder for a comma-separated list of animals detected in selected images in Finder.
   */
  "{{imageAnimals}}": {
    name: "imageAnimals",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const imageAnimals = context && "imageAnimals" in context ? context["imageAnimals"] : "";
      return { result: imageAnimals, imageAnimals: imageAnimals };
    },
    result_keys: ["imageAnimals"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{imageAnimals}}"].apply("{{imageAnimals}}")).result,
    example: "Explain how these animals are similar: {{imageAnimals}}",
    description: "Replaced with a comma-separated list of animals detected in selected images in Finder.",
    hintRepresentation: "{{imageAnimals}}",
  },

  /**
   * Placeholder for a comma-separated list of objects detected in selected images in Finder.
   */
  "{{imageSubjects}}": {
    name: "imageSubjects",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const imageSubjects = context && "imageSubjects" in context ? context["imageSubjects"] : "";
      return { result: imageSubjects, imageSubjects: imageSubjects };
    },
    result_keys: ["imageSubjects"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{imageSubjects}}"].apply("{{imageSubjects}}")).result,
    example: "What is the common theme among these objects? {{imageSubjects}}",
    description: "Replaced with a comma-separated list of objects detected in selected images in Finder.",
    hintRepresentation: "{{imageSubjects}}",
  },

  /**
   * Placeholder for a comma-separated list of normalized points of interest (i.e. landmark locations as (x, y) coordinates in the (0,0) to (1, 1) space) detected in selected images in Finder.
   */
  "{{imagePOI}}": {
    name: "imagePOI",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const imagePOI = context && "imagePOI" in context ? context["imagePOI"] : "";
      return { result: imagePOI, imagePOI: imagePOI };
    },
    result_keys: ["imagePOI"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{imagePOI}}"].apply("{{imagePOI}}")).result,
    example: "Where are the points of interest in this image? {{imagePOI}}",
    description:
      "Replaced with a comma-separated list of normalized points of interest detected in selected images in Finder.",
    hintRepresentation: "{{imagePOI}}",
  },

  /**
   * Placeholder for a comma-separated list of decoded barcodes detected in selected images in Finder.
   */
  "{{imageBarcodes}}": {
    name: "imageBarcodes",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const imageBarcodes = context && "imageBarcodes" in context ? context["imageBarcodes"] : "";
      return { result: imageBarcodes, imageBarcodes: imageBarcodes };
    },
    result_keys: ["imageBarcodes"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{imageBarcodes}}"].apply("{{imageBarcodes}}")).result,
    example: "Identify the common theme among these barcode values: {{imageBarcodes}}",
    description: "Replaced with a comma-separated list of decoded barcodes detected in selected images in Finder.",
    hintRepresentation: "{{imageBarcodes}}",
  },

  /**
   * Placeholder for a comma-separated list of rectangles detected in selected images in Finder.
   */
  "{{imageRectangles}}": {
    name: "imageRectangles",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const imageRectangles = context && "imageRectangles" in context ? context["imageRectangles"] : "";
      return { result: imageRectangles, imageRectangles: imageRectangles };
    },
    result_keys: ["imageRectangles"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{imageRectangles}}"].apply("{{imageRectangles}}")).result,
    example: "Where is the largest rectangle in this image? {{imageRectangles}}",
    description:
      "Replaced with a comma-separated list of rectangles detected in selected images in Finder. The rectangles are defined in the format <Rectangle #1: midPoint=(centerX, centerY) dimensions=WidthxHeight>.",
    hintRepresentation: "{{imageRectangles}}",
  },

  /**
   * The raw text extracted from selected PDFs in Finder. Does not use OCR.
   */
  "{{pdfRawText}}": {
    name: "pdfRawText",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const pdfRawText = context && "pdfRawText" in context ? context["pdfRawText"] : "";
      return { result: pdfRawText, pdfRawText: pdfRawText };
    },
    result_keys: ["pdfRawText"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{pdfRawText}}"].apply("{{pdfRawText}}")).result,
    example: "Summarize this: {{pdfRawText}}",
    description: "Replaced with the raw text extracted from selected PDFs in Finder. Does not use OCR.",
    hintRepresentation: "{{pdfRawText}}",
  },

  /**
   * The text extracted from selected PDFs in Finder using OCR.
   */
  "{{pdfOCRText}}": {
    name: "pdfOCRText",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const pdfOCRText = context && "pdfOCRText" in context ? context["pdfOCRText"] : "";
      return { result: pdfOCRText, pdfOCRText: pdfOCRText };
    },
    result_keys: ["pdfOCRText"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{pdfOCRText}}"].apply("{{pdfOCRText}}")).result,
    example: "Summarize this: {{pdfOCRText}}",
    description: "Replaced with the text extracted from selected PDFs in Finder using OCR.",
    hintRepresentation: "{{pdfOCRText}}",
  },

  /**
   * Placeholder for the contents of the currently selected files in Finder.
   */
  "{{contents}}": {
    name: "contents",
    aliases: [
      "{{selectedFileContents}}",
      "{{selectedFilesContents}}",
      "{{selectedFileContent}}",
      "{{selectedFilesContent}}",
      "{{selectedFileText}}",
      "{{selectedFilesText}}",
      "{{contents}}",
    ],
    apply: async (str: string, context?: { [key: string]: string }) => {
      const contents = context && "contents" in context ? context["contents"] : "";
      return { result: contents, contents: contents };
    },
    result_keys: ["contents"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{contents}}"].apply("{{contents}}")).result,
    example: "Identify the common theme among these files: {{contents}}",
    description:
      "Replaced with the extracted contents of the currently selected files in Finder. Clarifying text is added to identify each type of information.",
    hintRepresentation: "{{contents}}",
  },

  /**
   * Placeholder for the name of the current application. Barring any issues, this should always be replaced.
   */
  "{{currentAppName}}": {
    name: "currentAppName",
    aliases: ["{{currentApp}}", "{{currentApplication}}", "{{currentApplicationName}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      try {
        const app = (await getFrontmostApplication()).name || "";
        return { result: app, currentAppName: app };
      } catch (e) {
        return { result: "", currentAppName: "" };
      }
    },
    result_keys: ["currentAppName"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{currentAppName}}"].apply("{{currentAppName}}")).result,
    example: "Tell me about {{currentAppName}}",
    description: "Replaced with the name of the current application.",
    hintRepresentation: "{{currentAppName}}",
  },

  /**
   * Placeholder for the path of the current application. Barring any issues, this should always be replaced.
   */
  "{{currentAppPath}}": {
    name: "currentAppPath",
    aliases: ["{{currentApplicationPath}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      try {
        const appPath = (await getFrontmostApplication()).path || "";
        return { result: appPath, currentAppPath: appPath };
      } catch (e) {
        return { result: "", currentAppPath: "" };
      }
    },
    result_keys: ["currentAppPath"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{currentAppPath}}"].apply("{{currentAppPath}}")).result,
    example: "Tell me about {{currentAppPath}}",
    description: "Replaced with the path of the current application.",
    hintRepresentation: "{{currentAppPath}}",
  },

  /**
   * Placeholder for the current working directory. If the current application is not Finder, this placeholder will not be replaced.
   */
  "{{currentDirectory}}": {
    name: "currentDirectory",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const dir = await runAppleScript(
        `tell application "Finder" to return POSIX path of (insertion location as alias)`
      );
      return { result: dir, currentDirectory: dir };
    },
    result_keys: ["currentDirectory"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{currentDirectory}}"].apply("{{currentDirectory}}")).result,
    example: "Tell me about {{currentDirectory}}",
    description: "Replaced with the path of the current working directory in Finder.",
    hintRepresentation: "{{currentDirectory}}",
  },

  /**
   * Placeholder for the current URL in any supported browser. See {@link SupportedBrowsers} for the list of supported browsers. If the current application is not a supported browser, this placeholder will not be replaced.
   */
  "{{currentURL}}": {
    name: "currentURL",
    aliases: ["{{currentTabURL}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      try {
        const appName = context?.["currentAppName"]
          ? context["currentAppName"]
          : (await getFrontmostApplication()).name;
        const url = await getCurrentURL(appName);
        return { result: url, currentURL: url, currentAppName: appName };
      } catch (e) {
        return { result: "", currentURL: "", currentAppName: "" };
      }
    },
    result_keys: ["currentURL", "currentAppName"],
    dependencies: ["currentAppName"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{currentURL}}"].apply("{{currentURL}}")).result,
    example: "Tell me about {{currentURL}}",
    description: "Replaced with the URL of the current tab in any supported browser.",
    hintRepresentation: "{{currentURL}}",
  },

  /**
   * Placeholder for the visible text of the current tab in any supported browser. See {@link SupportedBrowsers} for the list of supported browsers. If the current application is not a supported browser, this placeholder will not be replaced.
   */
  "{{currentTabText}}": {
    name: "currentTabText",
    aliases: ["{{tabText}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      try {
        const appName = context?.["currentAppName"]
          ? context["currentAppName"]
          : (await getFrontmostApplication()).name;
        const URL = context?.["currentURL"] ? context["currentURL"] : await getCurrentURL(appName);
        if (appName == "Safari") {
          const URLText = filterString(await getSafariTabText());
          return { result: URLText, currentTabText: URLText, currentAppName: appName, currentURL: URL };
        }
        const URLText = await getTextOfWebpage(URL);
        return { result: URLText, currentTabText: URLText, currentAppName: appName, currentURL: URL };
      } catch (e) {
        return { result: "", currentTabText: "", currentAppName: "", currentURL: "" };
      }
    },
    result_keys: ["currentTabText", "currentURL", "currentAppName"],
    dependencies: ["currentAppName", "currentURL"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{currentTabText}}"].apply("{{currentTabText}}")).result,
    example: "Summarize this: {{currentTabText}}",
    description: "Replaced with the visible text of the current tab in any supported browser.",
    hintRepresentation: "{{currentTabText}}",
  },

  /**
   * Placeholder for the username of the currently logged-in user. Barring any issues, this should always be replaced.
   */
  "{{user}}": {
    name: "user",
    aliases: ["{{username}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      const user = os.userInfo().username;
      return { result: user, user: user };
    },
    result_keys: ["user"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{user}}"].apply("{{user}}")).result,
    example: "Come up with nicknames for {{user}}",
    description: "Replaced with the username of the currently logged-in user.",
    hintRepresentation: "{{user}}",
  },

  /**
   * Placeholder for the home directory of the currently logged-in user. Barring any issues, this should always be replaced.
   */
  "{{homedir}}": {
    name: "homedir",
    aliases: ["{{homeDirectory}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      const dir = os.homedir();
      return { result: dir, homedir: dir };
    },
    result_keys: ["homedir"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{homedir}}"].apply("{{homedir}}")).result,
    example: '{{as:tell application "Finder" to reveal POSIX file "{{homedir}}"}}',
    description: "Replaced with the path of the home directory for the currently logged-in user.",
    hintRepresentation: "{{homedir}}",
  },

  /**
   * Placeholder for the hostname of the current machine. Barring any issues, this should always be replaced.
   */
  "{{hostname}}": {
    name: "hostname",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const name = os.hostname();
      return { result: name, hostname: name };
    },
    result_keys: ["hostname"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{hostname}}"].apply("{{hostname}}")).result,
    example: "Come up with aliases for {{hostname}}",
    description: "Replaced with the hostname of the current machine.",
    hintRepresentation: "{{hostname}}",
  },

  /**
   * Placeholder for the 'pretty' hostname of the current machine. Barring any issues, this should always be replaced.
   */
  "{{computerName}}": {
    name: "computerName",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "computerName" in context) {
        return { result: context["computerName"], computerName: context["computerName"] };
      }

      const name = await getComputerName();
      return { result: name, computerName: name };
    },
    result_keys: ["computerName"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{computerName}}"].apply("{{computerName}}")).result,
    example: "Come up with aliases for {{computerName}}",
    description: "Replaced with the 'pretty' hostname of the current machine.",
    hintRepresentation: "{{computerName}}",
  },

  /**
   * Placeholder for the list of names of all Siri Shortcuts on the current machine. The list is comma-separated.
   */
  "{{shortcuts}}": {
    name: "shortcuts",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const shortcuts =
        context && "shortcuts" in context
          ? context["shortcuts"]
          : await runAppleScript(`tell application "Shortcuts Events" to return name of every shortcut`);
      return { result: shortcuts, shortcuts: shortcuts };
    },
    result_keys: ["shortcuts"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{shortcuts}}"].apply("{{shortcuts}}")).result,
    example: "Based on the following list, recommend some Siri Shortcuts for me to create: {{shortcuts}}",
    description: "Replaced with a comma-separated list of names of each Shortcut on the current machine.",
    hintRepresentation: "{{shortcuts}}",
  },

  /**
   * Placeholder for the current date supporting an optional format argument. Defaults to "Month Day, Year". Barring any issues, this should always be replaced.
   */
  "{{date( format=(\"|').*?(\"|'))?}}": {
    name: "date",
    aliases: ["{{currentDate( format=(\"|').*?(\"|'))?}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      const format = str.match(/(?<=format=("|')).*?(?=("|'))/)?.[0] || "MMMM d, yyyy";
      const dateStr =
        context && "date" in context
          ? context["date"]
          : await runAppleScript(`use framework "Foundation"
        set currentDate to current application's NSDate's alloc()'s init()
        try
          set formatter to current application's NSDateFormatter's alloc()'s init()
          set format to "${format}"
          formatter's setAMSymbol:"AM"
          formatter's setPMSymbol:"PM"
          formatter's setDateFormat:format
          return (formatter's stringFromDate:currentDate) as string
        end try`);
      return { result: dateStr, date: dateStr };
    },
    result_keys: ["date"],
    constant: false,
    fn: async (format: string) =>
      (
        await Placeholders.allPlaceholders["{{date( format=(\"|').*?(\"|'))?}}"].apply(
          `{{date${format?.length ? ` format="${format}"` : ""}}`
        )
      ).result,
    example: "What happened on {{date format='MMMM d'}} in history?",
    description: "Replaced with the current date in the specified format.",
    hintRepresentation: "{{date}}",
  },

  /**
   * Placeholder for the current day of the week, e.g. "Monday", using en-US as the default locale. Supports an optional locale argument. Barring any issues, this should always be replaced.
   */
  "{{day( locale=(\"|').*?(\"|'))?}}": {
    name: "day",
    aliases: [
      "{{dayName( locale=(\"|').*?(\"|'))?}}",
      "{{currentDay( locale=(\"|').*?(\"|'))?}}",
      "{{currentDayName( locale=(\"|').*?(\"|'))?}}",
    ],
    apply: async (str: string, context?: { [key: string]: string }) => {
      const locale = str.match(/(?<=locale=("|')).*?(?=("|'))/)?.[0] || "en-US";
      const day = new Date().toLocaleDateString(locale, { weekday: "long" });
      return { result: day, day: day };
    },
    result_keys: ["day"],
    constant: false,
    fn: async (locale: string) =>
      (
        await Placeholders.allPlaceholders["{{day( locale=(\"|').*?(\"|'))?}}"].apply(
          `{{day${locale?.length ? ` locale="${locale}"` : ""}}}`
        )
      ).result,
    example: "Write a generic agenda for {{day locale='en-GB'}}",
    description: "Replaced with the name of the current day of the week in the specified locale.",
    hintRepresentation: "{{day}}",
  },

  /**
   * Placeholder for the current time supporting an optional format argument. Defaults to "Hour:Minute:Second AM/PM". Barring any issues, this should always be replaced.
   */
  "{{time( format=(\"|').*?(\"|'))?}}": {
    name: "time",
    aliases: ["{{currentTime( format=(\"|').*?(\"|'))?}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      const format = str.match(/(?<=format=("|')).*?(?=("|'))/)?.[0] || "HH:mm:s a";
      const time =
        context && "time" in context
          ? context["time"]
          : await runAppleScript(`use framework "Foundation"
        set currentDate to current application's NSDate's alloc()'s init()
        try
          set formatter to current application's NSDateFormatter's alloc()'s init()
          set format to "${format}"
          formatter's setAMSymbol:"AM"
          formatter's setPMSymbol:"PM"
          formatter's setDateFormat:format
          return (formatter's stringFromDate:currentDate) as string
        end try`);
      return { result: time, time: time };
    },
    result_keys: ["time"],
    constant: false,
    fn: async (format?: string) =>
      (
        await Placeholders.allPlaceholders["{{time( format=(\"|').*?(\"|'))?}}"].apply(
          `{{time${format?.length ? ` format="${format}"` : ""}}}`
        )
      ).result,
    example: "It's currently {{time format='HH:mm'}}. How long until dinner?",
    description: "Replaced with the current time in the specified format.",
    hintRepresentation: "{{time}}",
  },

  /**
   * Placeholder for the default language for the current user. Barring any issues, this should always be replaced.
   */
  "{{systemLanguage}}": {
    name: "systemLanguage",
    aliases: ["{{language}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      const lang =
        context && "lang" in context
          ? context["lang"]
          : await runAppleScript(`use framework "Foundation"
                set locale to current application's NSLocale's autoupdatingCurrentLocale()
                set langCode to locale's languageCode()
                return (locale's localizedStringForLanguageCode:langCode) as text`);
      return { result: lang, systemLanguage: lang };
    },
    result_keys: ["systemLanguage"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{systemLanguage}}"].apply("{{systemLanguage}}")).result,
    example: 'Translate "Ciao" to {{systemLanguage}}',
    description: "Replaced with the name of the default language for the current user.",
    hintRepresentation: "{{systemLanguage}}",
  },

  /**
   * Placeholder for the comma-separated list of unique album names in Music.app.
   */
  "{{musicAlbums}}": {
    name: "musicAlbums",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "musicAlbums" in context) {
        return { result: context["musicAlbums"], musicAlbums: context["musicAlbums"] };
      }

      const albums = filterString((await getAlbumNames()).join(", "));
      return { result: albums, musicAlbums: albums };
    },
    result_keys: ["musicAlbums"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{musicAlbums}}"].apply("{{musicAlbums}}")).result,
    example: "Recommend some new albums based on the themes of these albums: {{musicAlbums}}",
    description: "Replaced with a comma-separated list of unique album names in Music.app.",
    hintRepresentation: "{{musicAlbums}}",
  },

  /**
   * Placeholder for the comma-separated list of unique artist names in Music.app.
   */
  "{{musicArtists}}": {
    name: "musicArtists",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "musicArtists" in context) {
        return { result: context["musicArtists"], musicArtists: context["musicArtists"] };
      }

      const artists = filterString((await getArtistNames()).join(", "));
      return { result: artists, musicArtists: artists };
    },
    result_keys: ["musicArtists"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{musicArtists}}"].apply("{{musicArtists}}")).result,
    example: "Recommend some new artists based on the styles of these artists: {{musicArtists}}",
    description: "Replaced with a comma-separated list of unique artist names in Music.app.",
    hintRepresentation: "{{musicArtists}}",
  },

  /**
   * Placeholder for the comma-separated list of unique playlist names in Music.app.
   */
  "{{musicPlaylists}}": {
    name: "musicPlaylists",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "musicPlaylists" in context) {
        return { result: context["musicPlaylists"], musicPlaylists: context["musicPlaylists"] };
      }

      const playlists = filterString((await getPlaylistNames()).join(", "));
      return { result: playlists, musicPlaylists: playlists };
    },
    result_keys: ["musicPlaylists"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{musicPlaylists}}"].apply("{{musicPlaylists}}")).result,
    example: "Recommend some new playlists based on the styles of these playlists: {{musicPlaylists}}",
    description: "Replaced with a comma-separated list of unique playlist names in Music.app.",
    hintRepresentation: "{{musicPlaylists}}",
  },

  /**
   * Placeholder for the comma-separated list of track names in Music.app.
   */
  "{{musicTracks}}": {
    name: "musicTracks",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "musicTracks" in context) {
        return { result: context["musicTracks"], musicTracks: context["musicTracks"] };
      }

      const tracks = filterString(await getTrackNames());
      return { result: tracks, musicTracks: tracks };
    },
    result_keys: ["musicTracks"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{musicTracks}}"].apply("{{musicTracks}}")).result,
    example: "Recommend some new songs based on the themes of these songs: {{musicTracks}}",
    description: "Replaced with a comma-separated list of track names in Music.app.",
    hintRepresentation: "{{musicTracks}}",
  },

  /**
   * Placeholder for the comma-separated list of director names in TV.app.
   */
  "{{tvDirectors}}": {
    name: "tvDirectors",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "tvDirectors" in context) {
        return { result: context["tvDirectors"], tvDirectors: context["tvDirectors"] };
      }

      const directors = filterString((await getDirectorNames()).join(", "));
      return { result: directors, tvDirectors: directors };
    },
    result_keys: ["tvDirectors"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{tvDirectors}}"].apply("{{tvDirectors}}")).result,
    example: "Recommend some TV/movie directors who make similar content to these directors: {{tvDirectors}}",
    description: "Replaced with a comma-separated list of director names in TV.app.",
    hintRepresentation: "{{tvDirectors}}",
  },

  /**
   * Placeholder for the comma-separated list of track names in TV.app.
   */
  "{{tvTracks}}": {
    name: "tvTracks",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "tvTracks" in context) {
        return { result: context["tvTracks"], tvTracks: context["tvTracks"] };
      }

      const tracks = filterString(await getTrackNames("TV"));
      return { result: tracks, tvTracks: tracks };
    },
    result_keys: ["tvTracks"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{tvTracks}}"].apply("{{tvTracks}}")).result,
    example: "Recommend some new shows and movies based on the themes of these: {{tvTracks}}",
    description: "Replaced with a comma-separated list of track names in TV.app.",
    hintRepresentation: "{{tvTracks}}",
  },

  /**
   * Placeholder for the comma-separated list of unique playlist names in TV.app.
   */
  "{{tvPlaylists}}": {
    name: "tvPlaylists",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "tvPlaylists" in context) {
        return { result: context["tvPlaylists"], tvPlaylists: context["tvPlaylists"] };
      }

      const playlists = filterString((await getPlaylistNames("TV")).join(", "));
      return { result: playlists, tvPlaylists: playlists };
    },
    result_keys: ["tvPlaylists"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{tvPlaylists}}"].apply("{{tvPlaylists}}")).result,
    example: "Recommend some new playlists based on the styles of these playlists: {{tvPlaylists}}",
    description: "Replaced with a comma-separated list of unique playlist names in TV.app.",
    hintRepresentation: "{{tvPlaylists}}",
  },

  /**
   * Placeholder for the comma-separated list of show names in TV.app.
   */
  "{{tvShows}}": {
    name: "tvShows",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "tvShows" in context) {
        return { result: context["tvShows"], tvShows: context["tvShows"] };
      }

      const shows = filterString((await getShowNames()).join(", "));
      return { result: shows, tvShows: shows };
    },
    result_keys: ["tvShows"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{tvShows}}"].apply("{{tvShows}}")).result,
    example: "Recommend some new shows based on the themes of these shows: {{tvShows}}",
    description: "Replaced with a comma-separated list of show names in TV.app.",
    hintRepresentation: "{{tvShows}}",
  },

  /**
   * Placeholder for the name of the currently playing track in Music.app.
   */
  "{{currentTrack}}": {
    name: "currentTrack",
    aliases: ["{{currentSong}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "currentTrack" in context) {
        return { result: context["currentTrack"], currentTrack: context["currentTrack"] };
      }

      const track = filterString(await getCurrentTrack());
      return { result: track, currentTrack: track };
    },
    result_keys: ["currentTrack"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{currentTrack}}"].apply("{{currentTrack}}")).result,
    example: "What's the history behind {{currentTrack}}?",
    description: "Replaced with the name of the currently playing track in Music.app.",
    hintRepresentation: "{{currentTrack}}",
  },

  /**
   * Placeholder for the name of the currently playing track in TV.app.
   */
  "{{currentTVTrack}}": {
    name: "currentTVTrack",
    aliases: ["{{currentSong}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "currentTVTrack" in context) {
        return { result: context["currentTVTrack"], currentTVTrack: context["currentTVTrack"] };
      }

      const track = filterString(await getCurrentTrack("TV"));
      return { result: track, currentTVTrack: track };
    },
    result_keys: ["currentTVTrack"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{currentTVTrack}}"].apply("{{currentTVTrack}}")).result,
    example: "Suggest similar TV shows and movies to {{currentTVTrack}}?",
    description: "Replaced with the name of the currently playing track in TV.app.",
    hintRepresentation: "{{currentTVTrack}}",
  },

  /**
   * Placeholder for the HTML text of the most recently edited note in Notes.app.
   */
  "{{lastNote}}": {
    name: "lastNote",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "lastNote" in context) {
        return { result: context["lastNote"], lastNote: context["lastNote"] };
      }

      const note = filterString(await getLastNote());
      return { result: note, lastNote: note };
    },
    result_keys: ["lastNote"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{lastNote}}"].apply("{{lastNote}}")).result,
    example: "Summarize this: {{lastNote}}",
    description: "Replaced with the HTML text of the most recently edited note in Notes.app.",
    hintRepresentation: "{{lastNote}}",
  },

  /**
   * Placeholder for the text of the most recently received email in Mail.app.
   */
  "{{lastEmail}}": {
    name: "lastEmail",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "lastEmail" in context) {
        return { result: context["lastEmail"], lastEmail: context["lastEmail"] };
      }

      const email = filterString(await getLastEmail());
      return { result: email, lastEmail: email };
    },
    result_keys: ["lastEmail"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{lastEmail}}"].apply("{{lastEmail}}")).result,
    example: "Summarize this: {{lastEmail}}",
    description: "Replaced with the text of the most recently received email in Mail.app.",
    hintRepresentation: "{{lastEmail}}",
  },

  /**
   * Placeholder for the comma-separated list of application names installed on the system.
   */
  "{{installedApps}}": {
    name: "installedApps",
    aliases: ["{{apps}}", "{{installedApplications}}", "{{applications}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "installedApps" in context) {
        return { result: context["installedApps"], installedApps: context["installedApps"] };
      }

      const apps = filterString(await getInstalledApplications());
      return { result: apps, installedApps: apps };
    },
    result_keys: ["installedApps"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{installedApps}}"].apply("{{installedApps}}")).result,
    example: "Based on this list of apps, recommend some new ones I might like: {{installedApps}}",
    description: "Replaced with the comma-separated list of names of applications installed on the system.",
    hintRepresentation: "{{installedApps}}",
  },

  /**
   * Placeholder for the comma-separated list of names of all installed PromptLab commands.
   */
  "{{commands}}": {
    name: "commands",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "commands" in context) {
        return { result: context["commands"], commands: context["commands"] };
      }

      const storedItems = await LocalStorage.allItems();
      const commands = filterString(Object.keys(storedItems).join(", "));
      return { result: commands, commands: commands };
    },
    result_keys: ["commands"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{commands}}"].apply("{{commands}}")).result,
    example: "Based on this list of AI commands, suggest some new ones I could create: {{commands}}",
    description: "Replaced with the comma-separated list of names of all installed PromptLab commands.",
    hintRepresentation: "{{commands}}",
  },

  /**
   * Placeholder for the comma-separated list of titles and URLs of the most frequently visited websites in Safari, obtained via plist.
   */
  "{{safariTopSites}}": {
    name: "safariTopSites",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "safariTopSites" in context) {
        return { result: context["safariTopSites"], safariTopSites: context["safariTopSites"] };
      }

      const sites = filterString(await getSafariTopSites());
      return { result: sites, safariTopSites: sites };
    },
    result_keys: ["safariTopSites"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{safariTopSites}}"].apply("{{safariTopSites}}")).result,
    example: "Based on this list of websites, suggest some new ones I might like: {{safariTopSites}}",
    description:
      "Replaced with the comma-separated list of titles and URLs of the most frequently visited websites in Safari.",
    hintRepresentation: "{{safariTopSites}}",
  },

  /**
   * Placeholder for the comma-separated list of titles and URLs of all bookmarks in Safari, obtained via plist.
   */
  "{{safariBookmarks}}": {
    name: "safariBookmarks",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "safariBookmarks" in context) {
        return { result: context["safariBookmarks"], safariBookmarks: context["safariBookmarks"] };
      }

      const sites = filterString(await getSafariBookmarks());
      return { result: sites, safariBookmarks: sites };
    },
    result_keys: ["safariBookmarks"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{safariBookmarks}}"].apply("{{safariBookmarks}}")).result,
    example: "Based on this list of websites, suggest some new ones I might like: {{safariBookmarks}}",
    description: "Replaced with the comma-separated list of titles and URLs of bookmarks in Safari.",
    hintRepresentation: "{{safariBookmarks}}",
  },

  /**
   * Placeholder for a comma-separated list of the names of all running applications that are visible to the user.
   */
  "{{runningApplications}}": {
    name: "runningApplications",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "runningApplications" in context) {
        return { result: context["runningApplications"], runningApplications: context["runningApplications"] };
      }

      const apps = filterString(await getRunningApplications());
      return { result: apps, runningApplications: apps };
    },
    result_keys: ["runningApplications"],
    constant: true,
    fn: async () =>
      (await Placeholders.allPlaceholders["{{runningApplications}}"].apply("{{runningApplications}}")).result,
    example: "Come up for a name for a workspace running the following apps: {{runningApplications}}",
    description:
      "Replaced with the comma-separated list of names of all running applications that are visible to the user.",
    hintRepresentation: "{{runningApplications}}",
  },

  /**
   * Placeholder for a unique UUID. UUIDs are tracked in the {@link StorageKey.USED_UUIDS} storage key. The UUID will be unique for each use of the placeholder (but there is no guarantee that it will be unique across different instances of the extension, e.g. on different computers).
   */
  "{{uuid}}": {
    name: "uuid",
    aliases: ["{{UUID}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      let newUUID = crypto.randomUUID();
      const usedUUIDs = await getStorage(StorageKeys.USED_UUIDS);
      if (Array.isArray(usedUUIDs)) {
        while (usedUUIDs.includes(newUUID)) {
          newUUID = crypto.randomUUID();
        }
        usedUUIDs.push(newUUID);
        await setStorage(StorageKeys.USED_UUIDS, usedUUIDs);
      } else {
        await setStorage(StorageKeys.USED_UUIDS, [newUUID]);
      }
      return { result: newUUID, uuid: newUUID };
    },
    constant: false,
    fn: async () => (await Placeholders.allPlaceholders["{{uuid}}"].apply("{{uuid}}")).result,
    example: "{{copy:{{uuid}}}}",
    description: "Replaced with a unique UUID. UUIDs are tracked in the {{usedUUIDs}} placeholder.",
    hintRepresentation: "{{uuid}}",
  },

  /**
   * Placeholder for a list of all previously used UUIDs since PromptLab's LocalStorage was last reset.
   */
  "{{usedUUIDs}}": {
    name: "usedUUIDs",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const usedUUIDs = await getStorage(StorageKeys.USED_UUIDS);
      if (Array.isArray(usedUUIDs)) {
        return { result: usedUUIDs.join(", "), usedUUIDs: usedUUIDs.join(", ") };
      }
      return { result: "", usedUUIDs: "" };
    },
    result_keys: ["usedUUIDs"],
    constant: false,
    fn: async () => (await Placeholders.allPlaceholders["{{usedUUIDs}}"].apply("{{usedUUIDs}}")).result,
    example: "{{copy:{{usedUUIDs}}}}",
    description:
      "Replaced with a comma-separated list of all previously used UUIDs since PromptLab's LocalStorage was last reset.",
    hintRepresentation: "{{usedUUIDs}}",
  },

  /**
   * Placeholder for the user's current latitude as determined by the their IP address.
   */
  "{{latitude}}": {
    name: "latitude",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "latitude" in context) {
        return { result: context["latitude"], latitude: context["latitude"] };
      }

      const jsonObj = await getJSONResponse("https://get.geojs.io/v1/ip/geo.json");
      const latitude = jsonObj["latitude"] as string;
      return { result: latitude, latitude: latitude };
    },
    result_keys: ["latitude"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{latitude}}"].apply("{{latitude}}")).result,
    example: "Tell me the history of {{latitude}}.",
    description: 'Replaced with the user\'s current latitude in the format "city, region, country".',
    hintRepresentation: "{{latitude}}",
  },

  /**
   * Placeholder for the user's current longitude as determined by the their IP address.
   */
  "{{longitude}}": {
    name: "longitude",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "longitude" in context) {
        return { result: context["longitude"], longitude: context["longitude"] };
      }

      const jsonObj = await getJSONResponse("https://get.geojs.io/v1/ip/geo.json");
      const longitude = jsonObj["longitude"] as string;
      return { result: longitude, longitude: longitude };
    },
    result_keys: ["longitude"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{longitude}}"].apply("{{longitude}}")).result,
    example: "Tell me the history of {{longitude}}.",
    description: 'Replaced with the user\'s current longitude in the format "city, region, country".',
    hintRepresentation: "{{longitude}}",
  },

  /**
   * Placeholder for the user's current location in the format "city, region, country".
   * The location is determined by the user's IP address.
   */
  "{{location}}": {
    name: "location",
    aliases: ["{{currentLocation}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "location" in context) {
        return { result: context["location"], location: context["location"] };
      }

      const jsonObj = await getJSONResponse("https://get.geojs.io/v1/ip/geo.json");
      const city = jsonObj["city"];
      const region = jsonObj["region"];
      const country = jsonObj["country"];
      const location = `${city}, ${region}, ${country}`;
      return { result: location, location: location };
    },
    result_keys: ["location"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{location}}"].apply("{{location}}")).result,
    example: "Tell me the history of {{currentLocation}}.",
    description: 'Replaced with the user\'s current location in the format "city, region, country".',
    hintRepresentation: "{{currentLocation}}",
  },

  /**
   * Placeholder for 24-hour weather forecast data at the user's current location, in JSON format.
   */
  "{{todayWeather}}": {
    name: "todayWeather",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "todayWeather" in context) {
        return { result: context["todayWeather"], todayWeather: context["todayWeather"] };
      }

      const weather = JSON.stringify(await getWeatherData(1));
      return { result: weather, todayWeather: weather };
    },
    result_keys: ["todayWeather"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{todayWeather}}"].apply("{{todayWeather}}")).result,
    example: "Summarize the following forecast for {{location}} today: {{todayWeather}}",
    description: "Replaced with 24-hour weather forecast data at the user's current location, in JSON format.",
    hintRepresentation: "{{todayWeather}}",
  },

  /**
   * Placeholder for 7-day weather forecast data at the user's current location, in JSON format.
   */
  "{{weekWeather}}": {
    name: "weekWeather",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "weekWeather" in context) {
        return { result: context["weekWeather"], weekWeather: context["weekWeather"] };
      }

      const weather = JSON.stringify(await getWeatherData(7));
      return { result: weather, weekWeather: weather };
    },
    result_keys: ["weekWeather"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{weekWeather}}"].apply("{{weekWeather}}")).result,
    example: "Summarize the following forecast for {{location}} this week: {{weekWeather}}",
    description: "Replaced with 7-day weather forecast data at the user's current location, in JSON format.",
    hintRepresentation: "{{weekWeather}}",
  },

  /**
   * Placeholder for a comma-separated list of the name, start time, and end time of all calendar events that are scheduled over the next 24 hours.
   */
  "{{todayEvents}}": {
    name: "todayEvents",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "todayEvents" in context) {
        return { result: context["todayEvents"], todayEvents: context["todayEvents"] };
      }

      const events = filterString(await ScriptRunner.Events(EventType.CALENDAR, CalendarDuration.DAY));
      return { result: events, todayEvents: events };
    },
    result_keys: ["todayEvents"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{todayEvents}}"].apply("{{todayEvents}}")).result,
    example: "Tell me about my events today based on the following list: {{todayEvents}}.",
    description:
      "Replaced with a list of the name, start time, and end time of all calendar events that are scheduled over the next 24 hours.",
    hintRepresentation: "{{todayEvents}}",
  },

  /**
   * Placeholder for a comma-separated list of the name, start time, and end time of all calendar events that are scheduled over the next 7 days.
   */
  "{{weekEvents}}": {
    name: "weekEvents",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "weekEvents" in context) {
        return { result: context["weekEvents"], weekEvents: context["weekEvents"] };
      }

      const events = filterString(await ScriptRunner.Events(EventType.CALENDAR, CalendarDuration.WEEK));
      return { result: events, weekEvents: events };
    },
    result_keys: ["weekEvents"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{weekEvents}}"].apply("{{weekEvents}}")).result,
    example: "Tell me about my events this week based on the following list: {{weekEvents}}.",
    description:
      "Replaced with a list of the name, start time, and end time of all calendar events scheduled over the next 7 days.",
    hintRepresentation: "{{weekEvents}}",
  },

  /**
   * Placeholder for a comma-separated list of the name, start time, and end time of all calendar events that are scheduled over the next 30 days.
   */
  "{{monthEvents}}": {
    name: "monthEvents",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "monthEvents" in context) {
        return { result: context["monthEvents"], monthEvents: context["monthEvents"] };
      }

      const events = filterString(await ScriptRunner.Events(EventType.CALENDAR, CalendarDuration.MONTH));
      return { result: events, monthEvents: events };
    },
    result_keys: ["monthEvents"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{monthEvents}}"].apply("{{monthEvents}}")).result,
    example: "Tell me about my events this month based on the following list: {{monthEvents}}.",
    description:
      "Replaced with a list of the name, start time, and end time of all calendar events scheduled over the next 30 days.",
    hintRepresentation: "{{monthEvents}}",
  },

  /**
   * Placeholder for a comma-separated list of the name, start time, and end time of all calendar events that are scheduled over the next 365 days.
   */
  "{{yearEvents}}": {
    name: "yearEvents",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "yearEvents" in context) {
        return { result: context["yearEvents"], yearEvents: context["yearEvents"] };
      }

      const events = filterString(await ScriptRunner.Events(EventType.CALENDAR, CalendarDuration.YEAR));
      return { result: events, yearEvents: events };
    },
    result_keys: ["yearEvents"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{yearEvents}}"].apply("{{yearEvents}}")).result,
    example: "Tell me about my events this year based on the following list: {{yearEvents}}.",
    description:
      "Replaced with a list of the name, start time, and end time of all calendar events scheduled over the next 365 days.",
    hintRepresentation: "{{yearEvents}}",
  },

  /**
   * Placeholder for a comma-separated list of the name and due date/time of all reminders that are scheduled over the next 24 hours.
   */
  "{{todayReminders}}": {
    name: "todayReminders",
    aliases: ["{{todayTasks}}", "{{todayTodos}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "todayReminders" in context) {
        return { result: context["todayReminders"], todayReminders: context["todayReminders"] };
      }

      const reminders = filterString(await ScriptRunner.Events(EventType.REMINDER, CalendarDuration.DAY));
      return { result: reminders, todayReminders: reminders };
    },
    result_keys: ["todayReminders"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{todayReminders}}"].apply("{{todayReminders}}")).result,
    example: "Tell me about my reminders today based on the following list: {{todayReminders}}.",
    description:
      "Replaced with a list of the name and due date/time of all reminders that are scheduled over the next 24 hours.",
    hintRepresentation: "{{todayReminders}}",
  },

  /**
   * Placeholder for a comma-separated list of the name and due date/time of all reminders that are scheduled over the next 7 days.
   */
  "{{weekReminders}}": {
    name: "weekReminders",
    aliases: ["{{weekTasks}}", "{{weekTodos}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "weekReminders" in context) {
        return { result: context["weekReminders"], weekReminders: context["weekReminders"] };
      }

      const reminders = filterString(await ScriptRunner.Events(EventType.REMINDER, CalendarDuration.WEEK));
      return { result: reminders, weekReminders: reminders };
    },
    result_keys: ["weekReminders"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{weekReminders}}"].apply("{{weekReminders}}")).result,
    example: "Tell me about my reminders this week based on the following list: {{weekReminders}}.",
    description:
      "Replaced with a list of the name and due date/time of all reminders that are scheduled over the next 7 days.",
    hintRepresentation: "{{weekReminders}}",
  },

  /**
   * Placeholder for a comma-separated list of the name and due date/time of all reminders that are scheduled over the next 30 days.
   */
  "{{monthReminders}}": {
    name: "monthReminders",
    aliases: ["{{monthTasks}}", "{{monthTodos}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "monthReminders" in context) {
        return { result: context["monthReminders"], monthReminders: context["monthReminders"] };
      }

      const reminders = filterString(await ScriptRunner.Events(EventType.REMINDER, CalendarDuration.MONTH));
      return { result: reminders, monthReminders: reminders };
    },
    result_keys: ["monthReminders"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{monthReminders}}"].apply("{{monthReminders}}")).result,
    example: "Tell me about my reminders this month based on the following list: {{monthReminders}}.",
    description:
      "Replaced with a list of the name and due date/time of all reminders that are scheduled over the next 30 days.",
    hintRepresentation: "{{monthReminders}}",
  },

  /**
   * Placeholder for a comma-separated list of the name and due date/time of all reminders that are scheduled over the next 365 days.
   */
  "{{yearReminders}}": {
    name: "yearReminders",
    aliases: ["{{yearTasks}}", "{{yearTodos}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "yearReminders" in context) {
        return { result: context["yearReminders"], yearReminders: context["yearReminders"] };
      }

      const reminders = filterString(await ScriptRunner.Events(EventType.REMINDER, CalendarDuration.YEAR));
      return { result: reminders, yearReminders: reminders };
    },
    result_keys: ["yearReminders"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{yearReminders}}"].apply("{{yearReminders}}")).result,
    example: "Tell me about my reminders this year based on the following list: {{yearReminders}}.",
    description:
      "Replaced with a list of the name and due date/time of all reminders that are scheduled over the next 365 days.",
    hintRepresentation: "{{yearReminders}}",
  },

  /**
   * Placeholder for the name of the last command executed by the user.
   */
  "{{previousCommand}}": {
    name: "previousCommand",
    aliases: ["{{lastCommand}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "previousCommand" in context) {
        return { result: context["previousCommand"], previousCommand: context["previousCommand"] };
      }
      return { result: "", previousCommand: "" };
    },
    result_keys: ["previousCommand"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{previousCommand}}"].apply("{{previousCommand}}")).result,
    example: "Run command in background: {{{{previousCommand}}}}",
    description: "Replaced with the name of the last command executed.",
    hintRepresentation: "{{previousCommand}}",
  },

  /**
   * Placeholder for the fully substituted text of the previous prompt.
   */
  "{{previousPrompt}}": {
    name: "previousPrompt",
    aliases: ["{{lastPrompt}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "previousPrompt" in context) {
        return { result: context["previousPrompt"], previousPrompt: context["previousPrompt"] };
      }
      return { result: "", previousPrompt: "" };
    },
    result_keys: ["previousPrompt"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{previousPrompt}}"].apply("{{previousPrompt}}")).result,
    example: "Compare these prompts: First prompt: ###some text###\n\nSecond prompt: ###{{previousPrompt}}###",
    description: "Replaced with the fully substituted text of the previous prompt.",
    hintRepresentation: "{{previousPrompt}}",
  },

  /**
   * Placeholder for the text of the AI's previous response.
   */
  "{{previousResponse}}": {
    name: "previousResponse",
    aliases: ["{{lastResponse}}", "{{previousOutput}}", "{{lastOutput}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (context && "previousResponse" in context) {
        return { result: context["previousResponse"], previousResponse: context["previousResponse"] };
      }
      return { result: "", previousResponse: "" };
    },
    result_keys: ["previousResponse"],
    constant: true,
    fn: async () => (await Placeholders.allPlaceholders["{{previousResponse}}"].apply("{{previousResponse}}")).result,
    example:
      "Compare these responses: First response: ###{{prompt:some text}}###\n\nSecond Response: ###{{previousResponse}}###",
    description: "Replaced with the text of the AI's previous response.",
    hintRepresentation: "{{previousResponse}}",
  },

  ...textFileExtensions
    .map((ext) => {
      if (["js", "as"].includes(ext)) {
        return `${ext}files`;
      }
      return ext;
    })
    .reduce((acc, ext) => {
      acc[
        `{{${ext.replaceAll(
          /[/\\+#!-]/g,
          "\\$1"
        )}:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}`
      ] = {
        name: `textfile:${ext}`,
        apply: async (str: string, context?: { [key: string]: string }) => {
          if (!context) return { result: "", [`textfile:${ext}`]: "" };
          if (!context["selectedFiles"]) return { result: "", [`image:${ext}`]: "" };

          const onSuccess =
            str.match(
              new RegExp(
                `{{${ext.replaceAll(
                  /\+#!-/g,
                  "\\$1"
                )}:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}`
              )
            )?.[1] || "";
          const onFailure =
            str.match(
              new RegExp(
                `{{${ext.replaceAll(
                  /\+#!-/g,
                  "\\$1"
                )}:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}`
              )
            )?.[4] || "";

          const files = context["selectedFiles"].split(",");
          const containsTextFile = files.some((file) => file.toLowerCase().endsWith(ext));
          if (!containsTextFile) return { result: onFailure, [`textfile:${ext}`]: onFailure };
          return { result: onSuccess, [`textfile:${ext}`]: onSuccess };
        },
        result_keys: [`textfile:${ext}`],
        constant: true,
        fn: async (content: string) =>
          (
            await Placeholders.allPlaceholders[
              `{{${ext}:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}`
            ].apply(`{{${ext}:${content}}}`, { selectedFiles: content })
          ).result,
        example: `{{${ext}:This one if any ${ext} file is selected:This one if no ${ext} file is selected}}`,
        description: `Flow control directive to include some content if any ${ext} file is selected and some other content if no ${ext} file is selected.`,
        hintRepresentation: `{{${ext}:...:...}}`,
      };
      return acc;
    }, {} as { [key: string]: Placeholder }),

  /**
   * Directive for directions that will only be included in the prompt if any image files are selected.
   */
  "{{textfiles:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}": {
    name: "contentForTextFiles",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (!context) return { result: "", contentForTextFiles: "" };
      if (!context["selectedFiles"]) return { result: "", contentForTextFiles: "" };

      const onSuccess =
        str.match(/{{textfiles:(([^{]|{(?!{)|{{[\s\S]*?}})*?)(:(([^{]|{(?!{)|{{[\s\S]*?}})*?))?}}/)?.[1] || "";
      const onFailure =
        str.match(/{{textfiles:(([^{]|{(?!{)|{{[\s\S]*?}})*?)(:(([^{]|{(?!{)|{{[\s\S]*?}})*?))?}}/)?.[4] || "";

      const files = context["selectedFiles"].split(",");
      const contentForTextFiles = files.some((file) =>
        textFileExtensions.some((ext) => file.toLowerCase().endsWith(ext))
      );
      if (!contentForTextFiles) return { result: onFailure, contentForTextFiles: onFailure };
      return { result: onSuccess, contentForTextFiles: onSuccess };
    },
    result_keys: ["contentForTextFiles"],
    constant: true,
    fn: async (content: string) =>
      (
        await Placeholders.allPlaceholders[
          "{{textfiles:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}"
        ].apply(`{{textfiles:${content}}}`)
      ).result,
    example: "{{textfiles:This one if any text file is selected:This one if no text file is selected}}",
    description:
      "Flow control directive to include some content if any text file is selected and some other content if no text file is selected.",
    hintRepresentation: "{{textfiles:...:...}}",
  },

  ...imageFileExtensions.reduce((acc, ext) => {
    acc[`{{${ext}:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}`] = {
      name: `image:${ext}`,
      apply: async (str: string, context?: { [key: string]: string }) => {
        if (!context) return { result: "", [`image:${ext}`]: "" };
        if (!context["selectedFiles"]) return { result: "", [`image:${ext}`]: "" };

        const onSuccess =
          str.match(
            new RegExp(`{{${ext}:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}`)
          )?.[1] || "";
        const onFailure =
          str.match(
            new RegExp(`{{${ext}:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}`)
          )?.[4] || "";

        const files = context["selectedFiles"].split(",");
        const containsImage = files.some((file) => file.toLowerCase().endsWith(ext));
        if (!containsImage) return { result: onFailure, [`image:${ext}`]: onFailure };
        return { result: onSuccess, [`image:${ext}`]: onSuccess };
      },
      result_keys: [`image:${ext}`],
      constant: true,
      fn: async (content: string) =>
        (
          await Placeholders.allPlaceholders[
            `{{${ext}:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}`
          ].apply(`{{${ext}:${content}}}`)
        ).result,
      example: `{{${ext}:This one if any ${ext} file is selected:This one if no ${ext} file is selected}}`,
      description: `Flow control directive to include some content if any ${ext} file is selected and some other content if no ${ext} file is selected.`,
      hintRepresentation: `{{${ext}:...:...}}`,
    };
    return acc;
  }, {} as { [key: string]: Placeholder }),

  /**
   * Directive for directions that will only be included in the prompt if any image files are selected.
   */
  "{{images:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}": {
    name: "contentForImages",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (!context) return { result: "", contentForImages: "" };
      if (!context["selectedFiles"]) return { result: "", contentForImages: "" };

      const onSuccess =
        str.match(/{{images:(([^{]|{(?!{)|{{[\s\S]*?}})*?)(:(([^{]|{(?!{)|{{[\s\S]*?}})*?))?}}/)?.[1] || "";
      const onFailure =
        str.match(/{{images:(([^{]|{(?!{)|{{[\s\S]*?}})*?)(:(([^{]|{(?!{)|{{[\s\S]*?}})*?))?}}/)?.[4] || "";

      const files = context["selectedFiles"].split(",");
      const contentForImages = files.some((file) =>
        imageFileExtensions.some((ext) => file.toLowerCase().endsWith(ext))
      );
      if (!contentForImages) return { result: onFailure, contentForImages: onFailure };
      return { result: onSuccess, contentForImages: onSuccess };
    },
    result_keys: ["contentForImages"],
    constant: true,
    fn: async (content: string) =>
      (
        await Placeholders.allPlaceholders[
          "{{images:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}"
        ].apply(`{{images:${content}}}`)
      ).result,
    example: "{{images:This one if any image file is selected:This one if no image file is selected}}",
    description:
      "Flow control directive to include some content if any image file is selected and some other content if no image file is selected.",
    hintRepresentation: "{{images:...:...}}",
  },

  ...videoFileExtensions.reduce((acc, ext) => {
    acc[`{{${ext}:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}`] = {
      name: `video:${ext}`,
      apply: async (str: string, context?: { [key: string]: string }) => {
        if (!context) return { result: "", [`video:${ext}`]: "" };
        if (!context["selectedFiles"]) return { result: "", [`video:${ext}`]: "" };

        const onSuccess =
          str.match(
            new RegExp(`{{${ext}:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}`)
          )?.[1] || "";
        const onFailure =
          str.match(
            new RegExp(`{{${ext}:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}`)
          )?.[4] || "";

        const files = context["selectedFiles"].split(",");
        const containsImage = files.some((file) => file.toLowerCase().endsWith(ext));
        if (!containsImage) return { result: onFailure, [`image:${ext}`]: onFailure };
        return { result: onSuccess, [`image:${ext}`]: onSuccess };
      },
      result_keys: [`video:${ext}`],
      constant: true,
      fn: async (content: string) =>
        (
          await Placeholders.allPlaceholders[
            `{{${ext}:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}`
          ].apply(`{{${ext}:${content}}}`)
        ).result,
      example: `{{${ext}:This one if any ${ext} file is selected:This one if no ${ext} file is selected}}`,
      description: `Flow control directive to include some content if any ${ext} file is selected and some other content if no ${ext} file is selected.`,
      hintRepresentation: `{{${ext}:...:...}}`,
    };
    return acc;
  }, {} as { [key: string]: Placeholder }),

  /**
   * Directive for directions that will only be included in the prompt if any video files are selected.
   */
  "{{videos:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}": {
    name: "contentForVideos",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (!context) return { result: "", contentForVideos: "" };
      if (!context["selectedFiles"]) return { result: "", contentForVideos: "" };

      const onSuccess =
        str.match(/{{videos:(([^{]|{(?!{)|{{[\s\S]*?}})*?)(:(([^{]|{(?!{)|{{[\s\S]*?}})*?))?}}/)?.[1] || "";
      const onFailure =
        str.match(/{{videos:(([^{]|{(?!{)|{{[\s\S]*?}})*?)(:(([^{]|{(?!{)|{{[\s\S]*?}})*?))?}}/)?.[4] || "";

      const files = context["selectedFiles"].split(",");
      const contentForVideos = files.some((file) =>
        videoFileExtensions.some((ext) => file.toLowerCase().endsWith(ext))
      );
      if (!contentForVideos) return { result: onFailure, contentForVideos: onFailure };
      return { result: onSuccess, contentForVideos: onSuccess };
    },
    result_keys: ["contentForVideos"],
    constant: true,
    fn: async (content: string) =>
      (
        await Placeholders.allPlaceholders[
          "{{videos:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}"
        ].apply(`{{videos:${content}}}`)
      ).result,
    example: "{{videos:This one if any video file is selected:This one if no video file is selected}}",
    description:
      "Flow control directive to include some content if any video file is selected and some other content if no video file is selected.",
    hintRepresentation: "{{videos:...:...}}",
  },

  ...audioFileExtensions.reduce((acc, ext) => {
    acc[`{{${ext}:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}`] = {
      name: `audio:${ext}`,
      apply: async (str: string, context?: { [key: string]: string }) => {
        if (!context) return { result: "", [`audio:${ext}`]: "" };
        if (!context["selectedFiles"]) return { result: "", [`audio:${ext}`]: "" };

        const onSuccess =
          str.match(
            new RegExp(`{{${ext}:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}`)
          )?.[1] || "";
        const onFailure =
          str.match(
            new RegExp(`{{${ext}:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}`)
          )?.[4] || "";

        const files = context["selectedFiles"].split(",");
        const containsImage = files.some((file) => file.toLowerCase().endsWith(ext));
        if (!containsImage) return { result: onFailure, [`image:${ext}`]: onFailure };
        return { result: onSuccess, [`image:${ext}`]: onSuccess };
      },
      result_keys: [`audio:${ext}`],
      constant: true,
      fn: async (content: string) =>
        (
          await Placeholders.allPlaceholders[
            `{{${ext}:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}`
          ].apply(`{{${ext}:${content}}}`)
        ).result,
      example: `{{${ext}:This one if any ${ext} file is selected:This one if no ${ext} file is selected}}`,
      description: `Flow control directive to include some content if any ${ext} file is selected and some other content if no ${ext} file is selected.`,
      hintRepresentation: `{{${ext}:...:...}}`,
    };
    return acc;
  }, {} as { [key: string]: Placeholder }),

  /**
   * Directive for directions that will only be included in the prompt if any video files are selected.
   */
  "{{audio:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}": {
    name: "contentForAudio",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (!context) return { result: "", contentForAudio: "" };
      if (!context["selectedFiles"]) return { result: "", contentForAudio: "" };

      const onSuccess =
        str.match(/{{audio:(([^{]|{(?!{)|{{[\s\S]*?}})*?)(:(([^{]|{(?!{)|{{[\s\S]*?}})*?))?}}/)?.[1] || "";
      const onFailure =
        str.match(/{{audio:(([^{]|{(?!{)|{{[\s\S]*?}})*?)(:(([^{]|{(?!{)|{{[\s\S]*?}})*?))?}}/)?.[4] || "";

      const files = context["selectedFiles"].split(",");
      const containsAudioFile = files.some((file) =>
        audioFileExtensions.some((ext) => file.toLowerCase().endsWith(ext))
      );
      if (!containsAudioFile) return { result: onFailure, contentForAudio: onFailure };
      return { result: onSuccess, contentForAudio: onSuccess };
    },
    result_keys: ["contentForAudio"],
    constant: true,
    fn: async (content: string) =>
      (
        await Placeholders.allPlaceholders[
          "{{audio:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}"
        ].apply(`{{audio:${content}}}`)
      ).result,
    example: "{{audio:This one if any audio file is selected:This one if no audio file is selected}}",
    description:
      "Flow control directive to include some content if any audio file is selected and some other content if no audio file is selected.",
    hintRepresentation: "{{audio:...:...}}",
  },

  /**
   * Directive for directions that will only be included in the prompt if any PDF files are selected.
   */
  "{{(pdf|PDF):(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}": {
    name: "contentForPDFs",
    apply: async (str: string, context?: { [key: string]: string }) => {
      if (!context) return { result: "", ["image:pdf"]: "" };
      if (!context["selectedFiles"]) return { result: "", ["image:pdf"]: "" };

      const onSuccess =
        str.match(new RegExp(`{{pdf:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}`))?.[1] ||
        "";
      const onFailure =
        str.match(new RegExp(`{{pdf:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}`))?.[4] ||
        "";

      const files = context["selectedFiles"].split(",");
      const containsImage = files.some((file) => file.toLowerCase().endsWith("pdf"));
      if (!containsImage) return { result: onFailure, ["image:pdf"]: onFailure };
      return { result: onSuccess, ["image:pdf"]: onSuccess };
    },
    result_keys: ["contentForPDFs"],
    constant: true,
    fn: async (content: string) =>
      (
        await Placeholders.allPlaceholders[
          "{{(pdf|PDF):(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)(:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?))?}}"
        ].apply(`{{pdf:${content}}}`)
      ).result,
    example: "{{pdf:This one if any PDF file is selected:This one if no PDF file is selected}}",
    description:
      "Flow control directive to include some content if any PDF file is selected and some other content if no PDF file is selected.",
    hintRepresentation: "{{pdf:...:...}}",
  },

  /**
   * Placeholder for the visible text content at a given URL.
   */
  "{{(url|URL)( raw=(true|false))?:.*?}}": {
    name: "url",
    aliases: ["{{https?:([\\s\\S]*?)}}"],
    apply: async (str: string, context?: { [key: string]: string }) => {
      try {
        const URL =
          str.match(/(url|URL)( raw=(true|false))?:(([^{]|{(?!{)|{{[\s\S]*?}})*?)}}/)?.[4] ||
          str.match(/{{(https?:[\s\S]*?)}}/)?.[1] ||
          "";
        const raw = str.match(/(url|URL)( raw=(true|false))?:(([^{]|{(?!{)|{{[\s\S]*?}})*?)}}/)?.[3] === "true";
        if (!URL) return { result: "" };

        const urlText = raw ? await getURLHTML(URL) : await getTextOfWebpage(URL);
        return { result: filterString(urlText) };
      } catch (e) {
        return { result: "" };
      }
    },
    constant: false,
    fn: async (url: string) => {
      return (await Placeholders.allPlaceholders["{{(url|URL)( raw=(true|false))?:.*?}}"].apply(`{{url:${url}}}`))
        .result;
    },
    example: "{{url:https://www.google.com}}",
    description:
      "Placeholder for the visible text content at a given URL. Accepts an optional `raw` parameter, e.g. `{{url:https://www.google.com raw=true}}`, to return the raw HTML of the page instead of the visible text.",
    hintRepresentation: "{{url:...}}",
  },

  /**
   * Placeholder for the raw text of a file at the given path. The path can be absolute or relative to the user's home directory (e.g. `~/Desktop/file.txt`). The file must be readable as UTF-8 text, or the placeholder will be replaced with an empty string.
   */
  "{{file:(.|^[\\s\\n\\r])*?}}": {
    name: "file",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const target = str.match(/(?<=(file:))[\s\S]*?(?=}})/)?.[0];
      if (!target) return { result: "", file: "" };

      const filePath = target.startsWith("~") ? target.replace("~", os.homedir()) : target;
      if (filePath == "") return { result: "", file: "" };

      if (!filePath.startsWith("/")) return { result: "", file: "" };

      try {
        const text = fs.readFileSync(filePath, "utf-8");
        return { result: filterString(text), file: filterString(text) };
      } catch (e) {
        return { result: "", file: "" };
      }
    },
    constant: false,
    fn: async (path: string) =>
      (await Placeholders.allPlaceholders["{{file:(.|^[\\s\\n\\r])*?}}"].apply(`{{file:${path}}}`)).result,
    example: "{{file:/Users/username/Desktop/file.txt}}",
    description: "Placeholder for the raw text of a file at the given path.",
    hintRepresentation: "{{file:...}}",
  },

  /**
   * Directive to increment a persistent counter variable by 1. Returns the new value of the counter.
   */
  "{{increment:[\\s\\S]*?}}": {
    name: "increment",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const name = str.match(/(?<=(increment:))[\s\S]*?(?=}})/)?.[0];
      const identifier = `id-${name}`;
      const value = parseInt((await LocalStorage.getItem(identifier)) || "0") + 1;
      await LocalStorage.setItem(identifier, value.toString());
      return { result: value.toString() };
    },
    constant: false,
    fn: async (id: string) =>
      (await Placeholders.allPlaceholders["{{increment:[\\s\\S]*?}}"].apply(`{{increment:${id}}}`)).result,
    example: "{{increment:counter}}",
    description: "Directive to increment a persistent counter variable by 1. Returns the new value of the counter.",
    hintRepresentation: "{{increment:x}}",
  },

  /**
   * Directive to decrement a persistent counter variable by 1. Returns the new value of the counter.
   */
  "{{decrement:[\\s\\S]*?}}": {
    name: "decrement",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const name = str.match(/(?<=(decrement:))[\s\S]*?(?=}})/)?.[0];
      const identifier = `id-${name}`;
      const value = parseInt((await LocalStorage.getItem(identifier)) || "0") + 1;
      await LocalStorage.setItem(identifier, value.toString());
      return { result: value.toString() };
    },
    constant: false,
    fn: async (id: string) =>
      (await Placeholders.allPlaceholders["{{decrement:[\\s\\S]*?}}"].apply(`{{decrement:${id}}}`)).result,
    example: "{{decrement:counter}}",
    description: "Directive to decrement a persistent counter variable by 1.",
    hintRepresentation: "{{decrement:x}}",
  },

  /**
   * Placeholder for the text content of the currently focused element.
   */
  '{{focusedElement( browser="(.*?)")?}}': {
    name: "focusedElement",
    aliases: [
      '{{activeElement( browser="(.*?)")?}}',
      '{{selectedElement( browser="(.*?)")?}}',
      '{{focusedElementText( browser="(.*?)")?}}',
      '{{activeElementText( browser="(.*?)")?}}',
      '{{selectedElementText( browser="(.*?)")?}}',
    ],
    apply: async (str: string, context?: { [key: string]: string }) => {
      try {
        const browser = str.match(/(focusedElement|activeElement|selectedElement)( browser=")(.*?)(")?/)?.[3];
        const appName = browser
          ? browser
          : context?.["currentAppName"]
          ? context["currentAppName"]
          : (await getFrontmostApplication()).name;

        const js = `document.activeElement.innerText`;
        const elementText = await runJSInActiveTab(js, appName);
        return { result: elementText };
      } catch (e) {
        return { result: "" };
      }
    },
    dependencies: ["currentAppName"],
    constant: false,
    fn: async (browser: string) =>
      (
        await Placeholders.allPlaceholders['{{focusedElement( browser="(.*?)")?}}'].apply(
          `{{focusedElement browser="${browser}"}}`
        )
      ).result,
    example: 'Summarize this: {{focusedElement browser="Safari"}}',
    description:
      "Replaced with the text content of the currently focused HTML element in the active tab of the given browser. If no browser is specified, the frontmost browser is used.",
    hintRepresentation: "{{focusedElement}}",
  },

  /**
   * Placeholder for the text content of an HTML element in the active tab of any supported browser.
   */
  '{{textOfElement( browser="(.*)")?:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)}}': {
    name: "elementText",
    aliases: ['{{elementText( browser="(.*)")?:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)}}'],
    apply: async (str: string, context?: { [key: string]: string }) => {
      try {
        const specifier = str.match(
          /{{(textOfElement|elementText)( browser="(.*)")?:(([^{]|{(?!{)|{{[\s\S]*?}})*?)}}/
        )?.[4];
        if (!specifier) return { result: "" };

        const browser = str.match(
          /{{(textOfElement|elementText)( browser="(.*)"):(([^{]|{(?!{)|{{[\s\S]*?}})*?)}}/
        )?.[3];

        const appName = browser
          ? browser
          : context?.["currentAppName"]
          ? context["currentAppName"]
          : (await getFrontmostApplication()).name;

        let js = `document.getElementById('${specifier}')?.innerText`;
        if (specifier.startsWith(".")) {
          js = `document.getElementsByClassName('${specifier.slice(1)}')[0]?.innerText`;
        } else if (specifier.startsWith("#")) {
          js = `document.getElementById('${specifier.slice(1)}')?.innerText`;
        } else if (specifier.startsWith("[")) {
          js = `document.querySelector('${specifier}')?.innerText`;
        } else if (specifier.startsWith("<") && specifier.endsWith(">")) {
          js = `document.getElementsByTagName('${specifier.slice(1, -1)}')[0]?.innerText`;
        }

        const elementText = await runJSInActiveTab(js, appName);
        return { result: elementText };
      } catch (e) {
        return { result: "" };
      }
    },
    dependencies: ["currentAppName"],
    constant: false,
    fn: async (specifier: string, browser?: string) =>
      (
        await Placeholders.allPlaceholders[
          '{{textOfElement( browser="(.*)")?:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)}}'
        ].apply(`{{elementText${browser ? ` browser="${browser}"` : ``}:${specifier}}}`)
      ).result,
    example: "Summarize this: {{elementText:#article}}",
    description: "Replaced with the text content of an HTML element in the active tab of any supported browser.",
    hintRepresentation: "{{elementText}}",
  },

  /**
   * Placeholder for the raw HTML content of an HTML element in the active tab of any supported browser.
   */
  '{{HTMLOfElement( browser="(.*)")?:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)}}': {
    name: "elementHTML",
    aliases: [
      '{{element( browser="(.*)")?:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)}}',
      '{{elementHTML( browser="(.*)")?:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)}}',
    ],
    apply: async (str: string, context?: { [key: string]: string }) => {
      try {
        const specifier = str.match(
          /{{(HTMLOfElement|element|elementHTML)( browser="(.*)")?:(([^{]|{(?!{)|{{[\s\S]*?}})*?)}}/
        )?.[4];
        if (!specifier) return { result: "" };

        const browser = str.match(
          /{{(HTMLOfElement|element|elementHTML)( browser="(.*)"):(([^{]|{(?!{)|{{[\s\S]*?}})*?)}}/
        )?.[3];

        const appName = browser
          ? browser
          : context?.["currentAppName"]
          ? context["currentAppName"]
          : (await getFrontmostApplication()).name;

        let js = `document.getElementById('${specifier}')?.outerHTML`;
        if (specifier.startsWith(".")) {
          js = `document.getElementsByClassName('${specifier.slice(1)}')[0]?.outerHTML`;
        } else if (specifier.startsWith("#")) {
          js = `document.getElementById('${specifier.slice(1)}')?.outerHTML`;
        } else if (specifier.startsWith("[")) {
          js = `document.querySelector('${specifier}')?.outerHTML`;
        } else if (specifier.startsWith("<") && specifier.endsWith(">")) {
          js = `document.getElementsByTagName('${specifier.slice(1, -1)}')[0]?.outerHTML`;
        }
        const elementHTML = await runJSInActiveTab(js, appName);
        return { result: elementHTML };
      } catch (e) {
        return { result: "" };
      }
    },
    dependencies: ["currentAppName"],
    constant: false,
    fn: async (specifier: string, browser?: string) =>
      (
        await Placeholders.allPlaceholders[
          '{{HTMLOfElement( browser="(.*)")?:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)}}'
        ].apply(`{{element${browser ? ` browser="${browser}"` : ``}:${specifier}}}`)
      ).result,
    example: "Summarize this: {{elementHTML:#article}}",
    description: "Replaced with the raw HTML source of an HTML element in the active tab of any supported browser.",
    hintRepresentation: "{{elementHTML}}",
  },

  /**
   * Placeholder for a comma-separated list of nearby locations based on the given search query.
   */
  "{{nearbyLocations:([\\s\\S]*)}}": {
    name: "nearbyLocations",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const query = str.match(/(?<=(nearbyLocations:))[\s\S]*?(?=}})/)?.[0];
      const nearbyLocations = await searchNearbyLocations(query || "");
      return { result: filterString(nearbyLocations) };
    },
    constant: false,
    fn: async (query?: string) =>
      (
        await Placeholders.allPlaceholders["{{nearbyLocations:([\\s\\S]*)}}"].apply(
          `{{nearbyLocations:${query || ""}}}`
        )
      ).result,
    example: "{{nearbyLocations:food}}",
    description: "Placeholder for a comma-separated list of nearby locations based on the given search query.",
    hintRepresentation: "{{nearbyLocations:...}}",
  },

  /**
   * Directive to select files. The placeholder will always be replaced with an empty string.
   */
  "{{selectFile:[\\s\\S]*?}}": {
    name: "selectFile",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const file = str.match(/(?<=(selectFiles:))[\s\S]*?(?=}})/)?.[0];
      if (!file) return { result: "" };
      await addFileToSelection(file);
      return { result: "" };
    },
    constant: false,
    fn: async (path: string) =>
      (await Placeholders.allPlaceholders["{{selectFile:[\\s\\S]*?}}"].apply(`{{selectFile:${path}}}`)).result,
    example: "{{selectFile:/Users/username/Desktop/file.txt}}",
    description: "Directive to a select file. The placeholder will always be replaced with an empty string.",
    hintRepresentation: "{{selectFile:...}}",
  },

  /**
   * Directive/placeholder to execute a Siri Shortcut by name, optionally supplying input, and insert the result. If the result is null, the placeholder will be replaced with an empty string.
   */
  "{{shortcut:([\\s\\S]+?)(:[\\s\\S]*?)?}}": {
    name: "shortcut",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const matches = str.match(/{{shortcut:([\s\S]+?)?(:[\s\S]*?)?}}/);
      if (matches) {
        const shortcutName = matches[1];
        const input = matches[2] ? matches[2].slice(1) : "";
        const result = await runAppleScript(`tell application "Shortcuts Events"
          set res to run shortcut "${shortcutName}" with input "${input}"
          if res is not missing value then
            return res
          else
            return ""
          end if 
        end tell`);
        return { result: result || "" };
      }
      return { result: "" };
    },
    constant: false,
    fn: async (shortcut: string, input?: string) =>
      (
        await Placeholders.allPlaceholders["{{shortcut:([\\s\\S]+?)(:[\\s\\S]*?)?}}"].apply(
          `{{shortcut:${shortcut}${input?.length ? `:${input}` : ""}}}`
        )
      ).result,
    example: "{{shortcut:My Shortcut:7}}",
    description: "Directive to execute a Siri Shortcut by name, optionally supplying input, and insert the result.",
    hintRepresentation: "{{shortcut:...}}",
  },

  /**
   * Replaces prompt placeholders with the response to the prompt.
   */
  "{{prompt:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)}}": {
    name: "prompt",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const prompt = str.match(/(?<=(prompt:))(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)}}/)?.[2] || "";
      if (prompt.trim().length == 0) return { result: "" };
      const response = await runModel(prompt, prompt, "");
      return { result: response || "" };
    },
    constant: false,
    fn: async (text: string) =>
      (await Placeholders.allPlaceholders["{{prompt:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)}}"].apply(`{{prompt:${text}}}`))
        .result,
    example: "{{prompt:Summarize {{url:https://example.com}}}}",
    description: "Replaced with the response to the prompt after running it in the background.",
    hintRepresentation: "{{prompt:...}}",
  },

  /**
   * Directive to run a Raycast command. The placeholder will always be replaced with an empty string. Commands are specified in the format {{command:commandName:extensionName}}.
   */
  "{{command:([^:}]*[\\s]*)*?(:([^:}]*[\\s]*)*?)?(:([^:}]*[\\s]*)*?)?}}": {
    name: "command",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const command = str.match(/command:([^:]*?)(:[^}:]*?)*(?=}})/)?.[1] || "";
      const extension = str.match(/(?<=(command:[^:]*?:))([^:]*?)(:[^}:]*?)*(?=}})/)?.[2] || "";
      const input = str.match(/(?<=(command:[^:]*?:[^:]*?:)).*?(?=}})/)?.[0] || "";

      // Locate the extension and command
      const cmd = command.trim();
      const ext = extension.trim();
      const extensions = await getExtensions();
      const targetExtension = extensions.find((extension) => {
        if (ext != "") {
          return extension.name == ext || extension.title == ext;
        } else {
          return extension.commands.find((command) => command.name == cmd) != undefined;
        }
      });

      if (targetExtension != undefined) {
        // Run the command belonging to the exact extension
        const targetCommand = targetExtension.commands.find((command) => command.name == cmd || command.title == cmd);
        if (targetCommand != undefined) {
          open(targetCommand.deeplink + (input.length > 0 ? `?fallbackText=${input}` : ``));
        }
      } else {
        // Run a command with the specified name, not necessary belonging to the target extension
        const targetCommand = extensions
          .map((extension) => extension.commands)
          .flat()
          .find((command) => command.name == cmd || command.title == cmd);
        if (targetCommand != undefined) {
          open(targetCommand.deeplink + (input.length > 0 ? `?fallbackText=${input}` : ``));
        }
      }
      return { result: "" };
    },
    constant: false,
    fn: async (command: string, extension?: string, input?: string) =>
      (
        await Placeholders.allPlaceholders[
          "{{command:([^:}]*[\\s]*)*?(:([^:}]*[\\s]*)*?)?(:([^:}]*[\\s]*)*?)?}}"
        ].apply(`{{command:${command}${extension?.length ? `:${extension}${input?.length ? `:${input}` : ``}` : ``}}`)
      ).result,
    example: "{{command:PromptLab Chat:PromptLab:Hello!}}",
    description:
      "Directive to run a Raycast command by name, optionally narrowing down the search to a specific extension. Input can be supplied as well.",
    hintRepresentation: "{{command:cmdName:extName:input}}",
  },

  /**
   * Replaces YouTube placeholders with the transcript of the corresponding YouTube video.
   */
  "{{(youtube|yt):([\\s\\S]*?)}}": {
    name: "youtube",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const specifier = str.match(/(?<=(youtube|yt):)[\s\S]*?(?=}})/)?.[0] || "";
      if (specifier.trim().length == 0) {
        return { result: "No video specified" };
      }

      const transcriptText = specifier.startsWith("http")
        ? await getYouTubeVideoTranscriptByURL(specifier)
        : await getYouTubeVideoTranscriptById(await getMatchingYouTubeVideoID(specifier));
      return { result: filterString(transcriptText) };
    },
    constant: false,
    fn: async (idOrURL: string) =>
      (await Placeholders.allPlaceholders["{{(youtube|yt):([\\s\\S]*?)}}"].apply(`{{youtube:${idOrURL}}}`)).result,
    example: "{{youtube:https://www.youtube.com/watch?v=dQw4w9WgXcQ}}",
    description: "Replaced with the transcript of the corresponding YouTube video.",
    hintRepresentation: "{{youtube:...}}",
  },

  /**
   * Placeholder for output of an AppleScript script. If the script fails, this placeholder will be replaced with an empty string. No sanitization is done in the script input; the expectation is that users will only use this placeholder with trusted scripts.
   */
  "{{(as|AS):(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)}}": {
    name: "as",
    apply: async (str: string, context?: { [key: string]: string }) => {
      try {
        const script = str.match(/(as|AS):(([^{]|{(?!{)|{{[\s\S]*?}})*?)}}/)?.[2];
        if (!script) return { result: "", applescript: "" };

        const res = await runAppleScript(script);
        return { result: res, applescript: res };
      } catch (e) {
        return { result: "", applescript: "" };
      }
    },
    constant: false,
    fn: async (script: string) =>
      (await Placeholders.allPlaceholders["{{(as|AS):(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)}}"].apply(`{{as:${script}}}`))
        .result,
    example: '{{as:display dialog "Hello World"}}',
    description:
      "Placeholder for output of an AppleScript script. If the script fails, this placeholder will be replaced with an empty string.",
    hintRepresentation: "{{as:...}}",
  },

  /**
   * Placeholder for output of a JavaScript for Automation script. If the script fails, this placeholder will be replaced with an empty string. No sanitization is done in the script input; the expectation is that users will only use this placeholder with trusted scripts.
   */
  "{{(jxa|JXA):(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)}}": {
    name: "jxa",
    apply: async (str: string, context?: { [key: string]: string }) => {
      try {
        const script = str.match(/(?<=(jxa|JXA):)(([^{]|{(?!{)|{{[\s\S]*?}})*?)}}/)?.[2];
        if (!script) return { result: "", jxa: "" };
        const res = execSync(
          `osascript -l JavaScript -e "${script
            .replaceAll('"', '\\"')
            .replaceAll("`", "\\`")
            .replaceAll("$", "\\$")
            .replaceAll(new RegExp(/[\n\r]/, "g"), " \\\n")}"`
        ).toString();
        return { result: res, jxa: res };
      } catch (e) {
        return { result: "", jxa: "" };
      }
    },
    constant: false,
    fn: async (script: string) =>
      (await Placeholders.allPlaceholders["{{(jxa|JXA):(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)}}"].apply(`{{jxa:${script}}}`))
        .result,
    example: "{{jxa:Application('Music').currentTrack.name()}}",
    description:
      "Placeholder for output of a JavaScript for Automation script. If the script fails, this placeholder will be replaced with an empty string.",
    hintRepresentation: "{{jxa:...}}",
  },

  /**
   * Placeholder for output of a shell script. If the script fails, this placeholder will be replaced with an empty string. No sanitization is done on the script input; the expectation is that users will only use this placeholder with trusted scripts.
   */
  "{{shell( .*)?:(.|[ \\n\\r\\s])*?}}": {
    name: "shell",
    apply: async (str: string, context?: { [key: string]: string }) => {
      try {
        const settings = loadAdvancedSettingsSync().placeholderSettings;
        const bin = str.match(/(?<=shell)( .*)?(?=:(.|[ \n\r\s])*?}})/)?.[0]?.trim() || "/bin/zsh";
        const pathScript = settings.useUserShellEnvironment ? `export PATH=$(${bin} -ilc "echo -n \\$PATH") &&` : "";
        const script = pathScript + str.match(/(?<=shell( .*)?:)(.|[ \n\r\s])*?(?=}})/)?.[0];
        if (!script) return { result: "", shell: "" };
        const res = filterString(execSync(script, { encoding: "ascii", shell: bin }).toString());
        return { result: res, shell: res };
      } catch (e) {
        return { result: "", shell: "" };
      }
    },
    constant: false,
    fn: async (script: string, bin = "/bin/zsh") =>
      (await Placeholders.allPlaceholders["{{shell( .*)?:(.|[ \\n\\r\\s])*?}}"].apply(`{{shell ${bin}:${script}}}`))
        .result,
    example: '{{shell:echo "Hello World"}}',
    description:
      "Placeholder for output of a shell script. If the script fails, this placeholder will be replaced with an empty string.",
    hintRepresentation: "{{shell:...}}",
  },

  /**
   * Directive to set the value of a persistent variable. If the variable does not exist, it will be created. The placeholder will always be replaced with an empty string.
   */
  "{{set [a-zA-Z0-9_]+:[\\s\\S]*?}}": {
    name: "setPersistentVariable",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const matches = str.match(/{{set ([a-zA-Z0-9_]+):([\s\S]*?)}}/);
      if (matches) {
        const key = matches[1];
        const value = matches[2];
        await setPersistentVariable(key, value);
      }
      return { result: "" };
    },
    constant: false,
    fn: async (id: string, value: string) =>
      (await Placeholders.allPlaceholders["{{set [a-zA-Z0-9_]+:[\\s\\S]*?}}"].apply(`{{set ${id}:${value}}}`)).result,
    example: "{{set myVariable:Hello World}}",
    description:
      "Directive to set the value of a persistent variable. If the variable does not exist, it will be created. The placeholder will always be replaced with an empty string.",
    hintRepresentation: "{{set x:...}}",
  },

  /**
   * Directive to copy the provided text to the clipboard. The placeholder will always be replaced with an empty string.
   */
  "{{copy:[\\s\\S]*?}}": {
    name: "copy",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const text = str.match(/(?<=(copy:))[\s\S]*?(?=}})/)?.[0];
      if (!text) return { result: "" };
      await Clipboard.copy(text);
      if (environment.commandName == "index") {
        await showHUD("Copied to Clipboard");
      } else {
        await showToast({ title: "Copied to Clipboard" });
      }
      return { result: "" };
    },
    constant: false,
    fn: async (text: string) =>
      (await Placeholders.allPlaceholders["{{copy:[\\s\\S]*?}}"].apply(`{{copy:${text}}}`)).result,
    example: "{{copy:Hello World}}",
    description:
      "Directive to copy the provided text to the clipboard. The placeholder will always be replaced with an empty string.",
    hintRepresentation: "{{copy:...}}",
  },

  /**
   * Directive to paste the provided text in the frontmost application. The placeholder will always be replaced with an empty string.
   */
  "{{paste:[\\s\\S]*?}}": {
    name: "paste",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const text = str.match(/(?<=(paste:))[\s\S]*?(?=}})/)?.[0];
      if (!text) return { result: "" };
      await Clipboard.paste(text);
      await showHUD("Pasted Into Frontmost App");
      return { result: "" };
    },
    constant: false,
    fn: async (text: string) =>
      (await Placeholders.allPlaceholders["{{paste:[\\s\\S]*?}}"].apply(`{{paste:${text}}}`)).result,
    example: "{{paste:Hello World}}",
    description:
      "Directive to paste the provided text in the frontmost application. The placeholder will always be replaced with an empty string.",
    hintRepresentation: "{{paste:...}}",
  },

  /**
   * Placeholder for output of a JavaScript script. If the script fails, this placeholder will be replaced with an empty string. The script is run in a sandboxed environment.
   */
  '{{(js|JS)( target="(.*?)")?:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)}}': {
    name: "js",
    apply: async (str: string, context?: { [key: string]: string }) => {
      try {
        const script = str.match(/(?<=(js|JS))( target="(.*?)")?:(([^{]|{(?!{)|{{[\s\S]*?}})*?)}}/)?.[4];
        const target = str.match(/(?<=(js|JS))( target="(.*?)")?:(([^{]|{(?!{)|{{[\s\S]*?}})*?)}}/)?.[3];
        if (!script) return { result: "", js: "" };

        if (target) {
          // Run in active browser tab
          const res = await runJSInActiveTab(script.replaceAll(/(\n|\r|\t|\\|")/g, "\\$1"), target);
          return { result: res, js: res };
        }

        // Run in sandbox
        const sandbox = Object.values(Placeholders.allPlaceholders).reduce((acc, placeholder) => {
          acc[placeholder.name] = placeholder.fn;
          return acc;
        }, {} as { [key: string]: (...args: never[]) => Promise<string> });
        sandbox["log"] = async (str: string) => {
          console.log(str); // Make logging available to JS scripts
          return "";
        };
        const res = await vm.runInNewContext(script, sandbox, { timeout: 1000, displayErrors: true });
        return { result: res, js: res };
      } catch (e) {
        return { result: "", js: "" };
      }
    },
    constant: false,
    fn: async (script: string) =>
      (
        await Placeholders.allPlaceholders['{{(js|JS)( target="(.*?)")?:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)}}'].apply(
          `{{js:${script}}}`
        )
      ).result,
    example: '{{js:log("Hello World")}}',
    description:
      "Placeholder for output of a JavaScript script. If the script fails, this placeholder will be replaced with an empty string. The script is run in a sandboxed environment.",
    hintRepresentation: "{{js:...}}",
  },

  /**
   * Directive to cut off the provided content after the specified number of characters.
   */
  "{{cutoff [0-9]+:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)}}": {
    name: "cutoff",
    apply: async (str: string, context?: { [key: string]: string }) => {
      const matches = str.match(/(?<=(cutoff ))[0-9]+:(([^{]|{(?!{)|{{[\s\S]*?}})*?)}}/);
      if (!matches) return { result: "" };
      const cutoff = parseInt(matches[0]);
      const content = matches[2];
      return { result: content.slice(0, cutoff) };
    },
    constant: false,
    fn: async (cutoff: string, content: string) =>
      (
        await Placeholders.allPlaceholders["{{cutoff [0-9]+:(([^{]|{(?!{)|{{[\\s\\S]*?}})*?)}}"].apply(
          `{{cutoff ${cutoff}:${content}}}`
        )
      ).result,
    example: "{{cutoff 5:Hello World}}",
    description: "Cuts off the content after the specified number of characters.",
    hintRepresentation: "{{cutoff n:...}}",
  },

  /**
   * Directive to ignore all content within the directive. Allows placeholders and directives to run without influencing the output.
   */
  "{{(ignore|IGNORE):[^}]*?}}": {
    name: "ignore",
    apply: async (str: string, context?: { [key: string]: string }) => {
      return { result: "" };
    },
    constant: false,
    fn: async (content: string) =>
      (await Placeholders.allPlaceholders["{{(ignore|IGNORE):[^}]*?}}"].apply(`{{ignore:${content}}}`)).result,
    example: '{{ignore:{{jxa:Application("Safari").activate()}}}}',
    description:
      "Directive to ignore all content within the directive. Allows placeholders and directives to run without influencing the output.",
    hintRepresentation: "{{ignore:...}}",
  },
};

/**
 * Applies placeholders to a single string.
 * @param str The string to apply placeholders to.
 * @returns The string with placeholders applied.
 */
const applyToString = async (str: string, context?: { [key: string]: string }) => {
  let subbedStr = str;
  const placeholderDefinition = Object.entries(placeholders);
  for (const [key, placeholder] of placeholderDefinition) {
    if (
      !subbedStr.match(new RegExp(key, "g")) &&
      (placeholder.aliases?.every((alias) => !subbedStr.match(new RegExp(alias, "g"))) || !placeholder.aliases?.length)
    )
      continue;
    if (placeholder.aliases && placeholder.aliases.some((alias) => subbedStr.indexOf(alias) != -1)) {
      for (const alias of placeholder.aliases) {
        while (subbedStr.match(new RegExp(alias, "g")) != undefined) {
          subbedStr = subbedStr.replace(new RegExp(alias), (await placeholder.apply(subbedStr, context)).result);
        }
      }
    } else {
      while (subbedStr.match(new RegExp(key, "g")) != undefined) {
        subbedStr = subbedStr.replace(new RegExp(key), (await placeholder.apply(subbedStr, context)).result);
      }
    }
  }
  return subbedStr;
};

/**
 * Applies placeholders to an array of strings.
 * @param strs The array of strings to apply placeholders to.
 * @returns The array of strings with placeholders applied.
 */
const applyToStrings = async (strs: string[], context?: { [key: string]: string }) => {
  const subbedStrs: string[] = [];
  for (const str of strs) {
    subbedStrs.push(await applyToString(str));
  }
  return subbedStrs;
};

/**
 * Applies placeholders to the value of a single key in an object.
 * @param obj The object to apply placeholders to.
 * @param key The key of the value to apply placeholders to.
 * @returns The object with placeholders applied.
 */
const applyToObjectValueWithKey = async (
  obj: { [key: string]: unknown },
  key: string,
  context?: { [key: string]: string }
) => {
  const value = obj[key];
  if (typeof value === "string") {
    return await applyToString(value);
  } else if (Array.isArray(value)) {
    return await applyToStrings(value);
  } else if (typeof value === "object") {
    return await applyToObjectValuesWithKeys(
      value as { [key: string]: unknown },
      Object.keys(value as { [key: string]: unknown })
    );
  } else {
    return (value || "undefined").toString();
  }
};

/**
 * Applies placeholders to an object's values, specified by keys.
 * @param obj The object to apply placeholders to.
 * @param keys The keys of the object to apply placeholders to.
 * @returns The object with placeholders applied.
 */
const applyToObjectValuesWithKeys = async (
  obj: { [key: string]: unknown },
  keys: string[],
  context?: { [key: string]: string }
) => {
  const subbedObj: { [key: string]: unknown } = {};
  for (const key of keys) {
    subbedObj[key] = await applyToObjectValueWithKey(obj, key);
  }
  return subbedObj;
};

/**
 * Loads custom placeholders from the custom-placeholders.json file in the support directory.
 * @returns The custom placeholders as a {@link PlaceholderList} object.
 */
const loadCustomPlaceholders = async (settings: { allowCustomPlaceholderPaths: boolean }) => {
  try {
    const preferences = getPreferenceValues<ExtensionPreferences>();
    const customPlaceholdersPath = path.join(environment.supportPath, CUSTOM_PLACEHOLDERS_FILENAME);
    const customPlaceholderFiles = [
      customPlaceholdersPath,
      ...(settings.allowCustomPlaceholderPaths ? preferences.customPlaceholderFiles.split(/, ?/g) : []),
    ].filter(
      (customPlaceholdersPath) => customPlaceholdersPath.trim().length > 0 && fs.existsSync(customPlaceholdersPath)
    );
    const customPlaceholderFileContents = await Promise.all(
      customPlaceholderFiles.map(async (customPlaceholdersPath) => {
        try {
          return await fs.promises.readFile(customPlaceholdersPath, "utf-8");
        } catch (e) {
          return "";
        }
      })
    );
    return customPlaceholderFileContents.reduce((acc, customPlaceholdersFile) => {
      try {
        const newPlaceholdersData = JSON.parse(customPlaceholdersFile);
        const newPlaceholders = (Object.entries(newPlaceholdersData) as [string, CustomPlaceholder][]).reduce(
          (acc, [key, placeholder]) => {
            try {
              new RegExp(key);
              acc[key] = {
                name: placeholder.name,
                apply: async (str: string, context?: { [key: string]: string }) => {
                  const match = str.match(new RegExp(`${key}`));
                  let value = placeholder.value;
                  (match || []).forEach((m, index) => {
                    value = value.replaceAll(`$${index}`, m?.replaceAll("\\", "\\\\") || "");
                  });
                  const res: { [key: string]: string; result: string } = { result: value };
                  res[placeholder.name] = value;
                  return res;
                },
                result_keys: [placeholder.name],
                constant: true,
                fn: async (content: string) =>
                  (await Placeholders.allPlaceholders[`{{${key}}}`].apply(`{{${key}}}`)).result,
                description: placeholder.description,
                example: placeholder.example,
                hintRepresentation: placeholder.hintRepresentation,
              };
            } catch (e) {
              showToast({ title: `Failed to load placeholder "${key}"`, message: `Invalid regex.` });
            }
            return acc;
          },
          {} as PlaceholderList
        );
        return { ...acc, ...newPlaceholders };
      } catch (e) {
        showToast({ title: "Invalid custom placeholders file", message: (e as Error).message });
        return acc;
      }
    }, {} as PlaceholderList);
  } catch (e) {
    return {};
  }
};

/**
 * Gets a list of placeholders that are included in a string.
 * @param str The string to check.
 * @returns The list of {@link Placeholder} objects.
 */
export const checkForPlaceholders = async (str: string): Promise<Placeholder[]> => {
  const settings = loadAdvancedSettingsSync().placeholderSettings;

  if (!settings.processPlaceholders) return [];

  const customPlaceholders = settings.allowCustomPlaceholders ? await loadCustomPlaceholders(settings) : {};
  const sortedPlaceholders: PlaceholderList = { ...customPlaceholders, ...placeholders };

  const includedPlaceholders = Object.entries(sortedPlaceholders)
    .filter(([key, placeholder]) => {
      if (placeholder.aliases) {
        return placeholder.aliases.some(
          (alias) =>
            str.match(new RegExp(key, "g")) ||
            str.match(new RegExp(alias, "g")) != undefined ||
            str.match(new RegExp(alias.replace("{{", "").replace("}}", ""), "g")) != undefined ||
            str.match(new RegExp(`(?<!{{)${placeholder.name.replace(/[!#+-]/g, "\\$1")}(?!}})`, "g")) != undefined
        );
      } else {
        return (
          str.match(new RegExp(key, "g")) != undefined ||
          str.match(new RegExp("(^| )" + key.replace("{{", "").replace("}}", ""), "g")) != undefined ||
          str.match(new RegExp(`(^| )(?<!{{)${placeholder.name.replace(/[!#+-]/g, "\\$1")}(?!}})`, "g")) != undefined
        );
      }
    })
    .sort(([keyA, placeholderA], [keyB, placeholderB]) => {
      // Order definitive occurrences first
      if (str.match(new RegExp(keyA, "g"))) {
        return -1;
      } else if (str.match(new RegExp(keyB, "g"))) {
        return 1;
      } else {
        return 0;
      }
    });
  return includedPlaceholders.map(([key, placeholder]) => placeholder);
};

/**
 * Applies placeholders to a string by memoizing the results of each placeholder.
 * @param str The string to apply placeholders to.
 * @returns The string with placeholders substituted.
 */
const bulkApply = async (str: string, context?: { [key: string]: string }): Promise<string> => {
  const preferences = getPreferenceValues<ExtensionPreferences>();
  const settings = loadAdvancedSettingsSync().placeholderSettings;

  if (!settings.processPlaceholders) return str;

  const customPlaceholders = settings.allowCustomPlaceholders ? await loadCustomPlaceholders(settings) : {};
  const sortedPlaceholders: PlaceholderList = { ...customPlaceholders, ...placeholders };
  const allPlaceholders = Object.entries(sortedPlaceholders);

  let subbedStr = str;
  const result = { ...(context || {}) };

  // Apply any substitutions that are already in the context
  for (const contextKey in context) {
    const keyHolder = allPlaceholders.find(([key, placeholder]) => placeholder.name == contextKey);
    if (keyHolder && !(contextKey == "input" && context[contextKey] == "")) {
      if (subbedStr.match(new RegExp(keyHolder[0] + "(?=(}}|[\\s\\S]|$))", "g"))) {
        subbedStr = subbedStr.replace(new RegExp(keyHolder[0] + "(?=(}}|[\\s\\S]|$))", "g"), context[contextKey]);

        if (preferences.usePlaceholderStatistics) {
          const currentCountString = await getPersistentVariable(`${contextKey}_count`);
          const currentCount = currentCountString.length ? parseInt(currentCountString) : 0;
          await setPersistentVariable(`${contextKey}_count`, (currentCount + 1).toString());
        }
      }
    }
  }

  for (const [key, placeholder] of allPlaceholders) {
    const keysToCheck = (placeholder.aliases || []).filter((alias) => subbedStr.match(new RegExp(alias, "g")));
    if (subbedStr.match(new RegExp(key, "g"))) {
      keysToCheck.push(key);
    }

    // Skip if the placeholder isn't in the string
    if (keysToCheck.length == 0) continue;

    const result_keys = placeholder.result_keys?.filter(
      (key) => !(key in result) || (result[key] == "" && key == "input")
    );
    if (result_keys != undefined && result_keys.length == 0) continue; // Placeholder is already in the context

    // Add any dependencies of this placeholder to the list of keys to check
    keysToCheck.push(
      ...(placeholder.dependencies?.reduce((acc, dependencyName) => {
        // Get the placeholder that matches the dependency name
        const dependency = allPlaceholders.find((placeholder) => placeholder[1].name == dependencyName);
        if (!dependency) return acc;

        // Add the placeholder key to the list of keys to check
        acc.push(dependency[0]);
        return acc;
      }, [] as string[]) || [])
    );

    for (const newKey of keysToCheck) {
      // Apply the placeholder and store the result
      while (subbedStr.match(new RegExp(newKey, "g")) != undefined) {
        const intermediateResult = await placeholder.apply(subbedStr, result);

        if (preferences.usePlaceholderStatistics) {
          const currentCountString = await getPersistentVariable(`${placeholder.name}_count`);
          const currentCount = currentCountString.length ? parseInt(currentCountString) : 0;
          await setPersistentVariable(`${placeholder.name}_count`, (currentCount + 1).toString());
        }

        if (placeholder.constant) {
          subbedStr = subbedStr.replace(new RegExp(newKey + "(?=(}}|[\\s\\S]|$))", "g"), intermediateResult.result);
        } else {
          subbedStr = subbedStr.replace(new RegExp(newKey + "(?=(}}|[\\s\\S]|$))"), intermediateResult.result);
        }

        for (const [key, value] of Object.entries(intermediateResult)) {
          result[key] = value;
          if (result_keys?.includes(key)) {
            result_keys.splice(result_keys.indexOf(key), 1);
          }
        }

        // Don't waste time applying other occurrences if the result is constant
        if (placeholder.constant) {
          break;
        }
      }
    }
  }
  return subbedStr;
};

/**
 * Gets the current value of persistent variable from the extension's persistent local storage.
 * @param name The name of the variable to get.
 * @returns The value of the variable, or an empty string if the variable does not exist.
 */
export const getPersistentVariable = async (name: string): Promise<string> => {
  const vars: PersistentVariable[] = await getStorage(StorageKeys.PERSISTENT_VARIABLES);
  const variable = vars.find((variable) => variable.name == name);
  if (variable) {
    return variable.value;
  }
  return "";
};

/**
 * Sets the value of a persistent variable in the extension's persistent local storage. If the variable does not exist, it will be created. The most recently set variable will be always be placed at the end of the list.
 * @param name The name of the variable to set.
 * @param value The initial value of the variable.
 */
export const setPersistentVariable = async (name: string, value: string) => {
  const vars: PersistentVariable[] = await getStorage(StorageKeys.PERSISTENT_VARIABLES);
  const variable = vars.find((variable) => variable.name == name);
  if (variable) {
    vars.splice(vars.indexOf(variable), 1);
    variable.value = value;
    vars.push(variable);
  } else {
    vars.push({ name: name, value: value, initialValue: value });
  }
  await setStorage(StorageKeys.PERSISTENT_VARIABLES, vars);
};

/**
 * Resets the value of a persistent variable to its initial value. If the variable does not exist, nothing will happen.
 * @param name The name of the variable to reset.
 */
export const resetPersistentVariable = async (name: string): Promise<string> => {
  const vars: PersistentVariable[] = await getStorage(StorageKeys.PERSISTENT_VARIABLES);
  const variable = vars.find((variable) => variable.name == name);
  if (variable) {
    vars.splice(vars.indexOf(variable), 1);
    variable.value = variable.initialValue;
    vars.push(variable);
    await setStorage(StorageKeys.PERSISTENT_VARIABLES, vars);
    return variable.value;
  }
  return "";
};

/**
 * Deletes a persistent variable from the extension's persistent local storage. If the variable does not exist, nothing will happen.
 * @param name The name of the variable to delete.
 */
export const deletePersistentVariable = async (name: string) => {
  const vars: PersistentVariable[] = await getStorage(StorageKeys.PERSISTENT_VARIABLES);
  const variable = vars.find((variable) => variable.name == name);
  if (variable) {
    vars.splice(vars.indexOf(variable), 1);
    await setStorage(StorageKeys.PERSISTENT_VARIABLES, vars);
  }
};

/**
 * Wrapper for all placeholder functions.
 */
export const Placeholders = {
  allPlaceholders: placeholders,
  applyToString: applyToString,
  applyToStrings: applyToStrings,
  applyToObjectValueWithKey: applyToObjectValueWithKey,
  applyToObjectValuesWithKeys: applyToObjectValuesWithKeys,
  bulkApply: bulkApply,
};
