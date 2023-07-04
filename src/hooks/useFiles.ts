import { runAppleScript } from "run-applescript";
import { CommandOptions, ERRORTYPE, ExtensionPreferences, Model } from "../utils/types";
import { useEffect, useState } from "react";
import { LocalStorage, environment, getPreferenceValues } from "@raycast/api";
import path from "path";
import * as fs from "fs";
import {
  audioFileExtensions,
  imageFileExtensions,
  officeFileExtensions,
  spreadsheetFileExtensions,
  textFileExtensions,
  videoFileExtensions,
} from "../data/file-extensions";
import { ScriptRunner, execScript } from "../utils/scripts";
import { getAudioDetails, getImageDetails } from "../utils/file-utils";
import { filterString } from "../utils/context";
import mammoth from "mammoth";
import pptxTextParser from "pptx-text-parser";
import xlsx from "xlsx";
import { useModels } from "./useModels";

const isTrueDirectory = (filepath: string) => {
  try {
    return fs.lstatSync(filepath).isDirectory() && !isApp(filepath);
  } catch (e) {
    return false;
  }
};

const isApp = (filepath: string) => {
  return path.extname(filepath).toLowerCase() === ".app";
};

const isPDF = (filepath: string) => {
  return path.extname(filepath).toLowerCase() === ".pdf";
};

const isVideoFile = (filepath: string) => {
  return videoFileExtensions.includes(path.extname(filepath).slice(1).toLowerCase());
};

const isAudioFile = (filepath: string) => {
  return audioFileExtensions.includes(path.extname(filepath).slice(1).toLowerCase());
};

const isImageFile = (filepath: string) => {
  return imageFileExtensions.includes(path.extname(filepath).slice(1).toLowerCase());
};

const isOfficeFile = (filepath: string) => {
  return officeFileExtensions.includes(path.extname(filepath).slice(1).toLowerCase());
};

const isSpreadsheet = (filepath: string) => {
  return spreadsheetFileExtensions.includes(path.extname(filepath).slice(1).toLowerCase());
};

const isTextFile = (filepath: string) => {
  return (
    textFileExtensions.includes(path.extname(filepath).slice(1).toLowerCase()) ||
    path.extname(filepath).toLowerCase() === ""
  );
};

export async function getFileContent(filePath: string, options?: CommandOptions) {
  const options_ =
    options == undefined
      ? {
          useMetadata: true,
          useAudioDetails: true,
          useSoundClassification: true,
          useSubjectClassification: true,
          useFaceDetection: true,
          useBarcodeDetection: true,
          useRectangleDetection: true,
          useSaliencyAnalysis: true,
        }
      : options;

  const items = await LocalStorage.allItems();
  const modelObjs: Model[] = Object.entries(items)
    .filter(([key]) => key.startsWith("--model-"))
    .map(([, value]) => JSON.parse(value))
    .sort((a, b) => a.name.localeCompare(b.name));

  let model = options?.model ? modelObjs.find((m) => m.name == options.model) : undefined;
  if (!model) model = modelObjs.find((m) => m.isDefault) || modelObjs[0];
  const maxCharacters = model ? parseInt(model.lengthLimit) : 3000;

  const currentData = { contents: `{File ${path.basename(filePath)}}:\n` };

  const filepath = filePath.toLowerCase();
  if (isTextFile(filepath)) addTextFileDetails(filepath, currentData);

  if (isTrueDirectory(filepath)) addDirectoryDetails(filepath, currentData);
  else if (isApp(filepath)) await addAppDetails(filepath, currentData, options_);
  else if (isPDF(filepath)) await addPDFDetails(filepath, currentData, options_);
  else if (isVideoFile(filepath)) await addVideoDetails(filepath, currentData, options_);
  else if (isAudioFile(filepath)) await addAudioDetails(filepath, currentData, options_);
  else if (isImageFile(filepath)) await addImageDetails(filepath, currentData, options_);
  else if (isOfficeFile(filepath)) await addOfficeDetails(filepath, currentData);
  else if (isSpreadsheet(filepath)) await addSpreadsheetDetails(filepath, currentData);
  else if (!isTextFile(filepath)) attemptAddRawText(filepath, currentData);

  if (options_.useMetadata) addMetadataDetails(filepath, currentData);
  currentData.contents = filterString(currentData.contents, maxCharacters);
  return currentData;
}

export const useFiles = (options: CommandOptions) => {
  const [selectedFiles, setSelectedFiles] = useState<{ paths: string[]; csv: string }>();
  const [fileContents, setFileContents] = useState<{ [key: string]: string; contents: string }>();
  const { models } = useModels();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<number>();

  const loadSelection = async () => {
    if (!options.minNumFiles)
      return {
        paths: [],
        csv: "",
      };

    const validExtensions = (options.acceptedFileExtensions || []).map((ext) => ext.toLowerCase());

    setIsLoading(true);
    const rawSelection = await ScriptRunner.SelectedFiles();

    // Remove invalid files and directories from the selection
    const selection = rawSelection.paths.reduce(
      (acc, filepath) => {
        if (
          filepath.trim().length > 0 &&
          (validExtensions.length == 0 || validExtensions.includes(path.extname(filepath).slice(1).toLowerCase()))
        ) {
          return { paths: [...acc.paths, filepath], csv: acc.csv + "," + filepath };
        }
        return acc;
      },
      { paths: [] as string[], csv: "" }
    );
    setSelectedFiles(selection);
    return selection;
  };

  const loadFileContents = async (selection: { paths: string[]; csv: string }) => {
    // Raise an error if too few files are selected
    if (selection.paths.length < (options.minNumFiles || 0)) {
      setError(ERRORTYPE.MIN_SELECTION_NOT_MET);
      setIsLoading(false);
      return;
    }

    let model = options.model ? models.find((m) => m.name == options.model) : undefined;
    if (!model) model = models.find((m) => m.isDefault) || models[0];
    const maxCharacters = model ? parseInt(model.lengthLimit) : 3000;

    const fileData: { [key: string]: string; contents: string } = {
      contents: "",
    };
    for (const [index, filepath] of selection.paths.entries()) {
      // Init. file contents with file name as header
      const currentData = { contents: `{File ${index + 1} - ${path.basename(filepath)}}:\n` };

      // If the file is too large, just return the metadata
      try {
        if (
          fs.lstatSync(filepath).size > 10000000 &&
          !videoFileExtensions.includes(path.extname(filepath).slice(1).toLowerCase())
        ) {
          addMetadataDetails(filepath, currentData);
          currentData.contents = fileData.contents + "\n" + currentData.contents;
          Object.assign(fileData, currentData);
          continue;
        }

        if (isTextFile(filepath)) addTextFileDetails(filepath, currentData);

        if (isTrueDirectory(filepath)) addDirectoryDetails(filepath, currentData);
        else if (isApp(filepath)) await addAppDetails(filepath, currentData, options);
        else if (isPDF(filepath)) await addPDFDetails(filepath, currentData, options);
        else if (isVideoFile(filepath)) await addVideoDetails(filepath, currentData, options);
        else if (isAudioFile(filepath)) await addAudioDetails(filepath, currentData, options);
        else if (isImageFile(filepath)) await addImageDetails(filepath, currentData, options);
        else if (isOfficeFile(filepath)) await addOfficeDetails(filepath, currentData);
        else if (isSpreadsheet(filepath)) await addSpreadsheetDetails(filepath, currentData);
        else if (!isTextFile(filepath)) attemptAddRawText(filepath, currentData);

        if (options.useMetadata) addMetadataDetails(filepath, currentData);

        currentData.contents =
          fileData.contents + "\n" + filterString(currentData.contents, maxCharacters / selection.paths.length);
        Object.assign(fileData, currentData);
      } catch (e) {
        console.error(e);
      }
    }

    setFileContents(fileData);
    return fileData;
  };

  const revalidate = async () => {
    const selection = await loadSelection();
    const fileContents = await loadFileContents(selection);
    setIsLoading(false);
    return { selectedFiles: selection, fileContents };
  };

  useEffect(() => {
    revalidate();
  }, []);

  return { selectedFiles, fileContents, isLoading, error, revalidate };
};

const addDirectoryDetails = (filepath: string, currentData: { [key: string]: string; contents: string }) => {
  const children = fs.readdirSync(filepath);
  currentData.contents += `This is a folder containing the following files: ${children.join(", ")}`;
};

const addSpreadsheetDetails = async (filepath: string, currentData: { [key: string]: string; contents: string }) => {
  const text = Object.values(xlsx.readFile(filepath).Sheets)
    .map((sheet) => xlsx.utils.sheet_to_txt(sheet))
    .join("\n\n");
  currentData.contents += text;
};

const addOfficeDetails = async (filepath: string, currentData: { [key: string]: string; contents: string }) => {
  let text = "";
  if (filepath.endsWith(".docx")) {
    text = (await mammoth.extractRawText({ path: filepath })).value;
  } else if (filepath.endsWith(".pptx")) {
    text = await pptxTextParser(filepath, "text");
  }
  currentData.contents += text;
};

const addAppDetails = async (
  filepath: string,
  currentData: { [key: string]: string; contents: string },
  options: CommandOptions
) => {
  /* Gets the metadata, plist, and scripting dictionary information about an application (.app). */
  let appDetails = "";

  // Include plist information
  const plist = (
    await runAppleScript(`use framework "Foundation"
  set theURL to current application's NSURL's fileURLWithPath:"${filepath}Contents/Info.plist"
  set theDict to current application's NSDictionary's dictionaryWithContentsOfURL:theURL |error|:(missing value)
  return theDict's |description|() as text`)
  ).replaceAll(/\s+/g, " ");
  // Include general application-focused instructions
  if (options.useMetadata) {
    appDetails += `<Plist info for this app: ###${plist}###>`;
  }

  // Include relevant child files
  const children = fs.readdirSync(`${filepath}Contents/Resources`);
  children.forEach((child) => {
    if (child.toLowerCase().endsWith("sdef")) {
      // Include scripting dictionary information & associated instruction
      const sdef = fs.readFileSync(`${filepath}Contents/Resources/${child}`).toString();
      appDetails += `AppleScript Scripting Dictionary: ###${sdef}###`;
    }
  });
  currentData.contents += appDetails;
  return appDetails;
};

const addPDFDetails = async (
  filepath: string,
  currentData: { [key: string]: string; contents: string },
  options: CommandOptions
) => {
  const preferences = getPreferenceValues<ExtensionPreferences>();
  const pdfText = await ScriptRunner.PDFTextExtractor(filepath, preferences.pdfOCR, 3, options.useMetadata || false);
  currentData.contents += filterString(pdfText.imageText);
  currentData["pdfRawText"] = filterString(pdfText.pdfRawText);
  currentData["pdfOCRText"] = filterString(pdfText.pdfOCRText);
};

const addVideoDetails = async (
  filepath: string,
  currentData: { [key: string]: string; contents: string },
  options: CommandOptions
) => {
  const videoFeatureExtractor = path.resolve(environment.assetsPath, "scripts", "VideoFeatureExtractor.scpt");
  const videoDetails = await execScript(
    videoFeatureExtractor,
    [
      filepath,
      options.useAudioDetails || false,
      options.useSubjectClassification || false,
      options.useFaceDetection || false,
      options.useRectangleDetection || false,
      options.useHorizonDetection || false,
    ],
    "JavaScript"
  ).data;
  currentData.contents += videoDetails;
};

const addAudioDetails = async (
  filepath: string,
  currentData: { [key: string]: string; contents: string },
  options: CommandOptions
) => {
  if (options.useAudioDetails) {
    const transcription = await ScriptRunner.AudioTranscriber(filepath, 5000);
    const audioDetails = transcription;
    currentData.contents += `<Spoken audio: """${audioDetails}"""`;
    currentData["audioTranscription"] = audioDetails;
  } else if (options.useSubjectClassification) {
    const audioClassifications = await getAudioDetails(filepath);
    currentData.contents += audioClassifications.contents;
    currentData["soundClassifications"] = audioClassifications.soundClassifications;
  }
};

const addImageDetails = async (
  filepath: string,
  currentData: { [key: string]: string; contents: string },
  options: CommandOptions
) => {
  const imageDetails = await getImageDetails(filepath, options);
  const imageVisionInstructions = imageDetails.output;
  currentData.contents += imageVisionInstructions;
  Object.assign(currentData, imageDetails);
};

const addTextFileDetails = (filepath: string, currentData: { [key: string]: string; contents: string }) => {
  try {
    if (fs.lstatSync(filepath).size > 10000000) return;
    const rawText = fs.readFileSync(filepath, "utf8");
    const text = rawText;
    const instruction = `\n<Text of the file: ###${text}###>`;
    currentData.contents += instruction;
  } catch (err) {
    console.error(err);
  }
};

const attemptAddRawText = (filepath: string, currentData: { [key: string]: string; contents: string }) => {
  try {
    if (fs.lstatSync(filepath).size > 10000000) return;
    const rawText = fs.readFileSync(filepath, "utf8");
    const text = rawText;
    const instruction = `\n<Raw text of the file: ###${text}###>`;
    currentData.contents += instruction;
  } catch (err) {
    console.error(err);
  }
};

const addMetadataDetails = (filepath: string, currentData: { [key: string]: string; contents: string }) => {
  try {
    const rawMetadata = JSON.stringify(fs.lstatSync(filepath));
    const metadata = rawMetadata;
    const instruction = `\n<Metadata of the file: ###${metadata}###>`;
    currentData.contents += instruction;
  } catch (err) {
    console.error(err);
  }
};
