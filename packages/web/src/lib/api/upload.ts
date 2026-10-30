import {
  ATTACHMENT_UPLOAD_FIELD,
  type Attachment,
  buildPath,
  endpoints,
} from "@homesplit/contracts";
import { ApiRequestError } from "./api-error";
import { redirectToSignIn } from "./session";

export interface UploadOptions {
  /** Called as the file is sent, with the share sent so far, from 0 to 1. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * Upload `file` as an attachment of the household. It goes through
 * `XMLHttpRequest` rather than the API client, since `fetch` can't report
 * upload progress. Failures throw an `ApiRequestError` like the client's,
 * and aborting through `signal` rejects with the signal's reason.
 */
export function uploadAttachment(
  householdId: string,
  file: File,
  { onProgress, signal }: UploadOptions = {}
): Promise<Attachment> {
  const endpoint = endpoints.uploadAttachment;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const settle = () => signal?.removeEventListener("abort", abort);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(event.loaded / event.total);
      }
    });
    xhr.addEventListener("load", () => {
      settle();
      const body = readJson(xhr.responseText);
      // Any 2xx is a success, as in the API client.
      if (xhr.status < 200 || xhr.status >= 300) {
        if (xhr.status === 401) {
          redirectToSignIn();
        }
        reject(
          ApiRequestError.fromBody("api", xhr.status, body, xhr.statusText)
        );
        return;
      }
      const parsed = endpoint.response.safeParse(body);
      if (parsed.success) {
        resolve(parsed.data);
      } else {
        reject(
          ApiRequestError.invalidResponse("api", xhr.status, parsed.error)
        );
      }
    });
    xhr.addEventListener("error", () => {
      settle();
      reject(ApiRequestError.network("api", new Error("Upload failed")));
    });
    xhr.addEventListener("abort", () => {
      settle();
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    });

    const form = new FormData();
    form.append(ATTACHMENT_UPLOAD_FIELD, file);
    xhr.open(endpoint.method, buildPath(endpoint, { householdId }));
    xhr.send(form);
  });
}

function readJson(text: string): unknown {
  if (!text) {
    return;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
