import { HTTPRequest } from 'puppeteer-core';

export function removeImagesAndCss(request: HTTPRequest) {
    if (request.isInterceptResolutionHandled()) return

    if (
        request.resourceType() == 'image' ||
        request.resourceType() == 'stylesheet' ||
        request.resourceType() == 'font'
    ) {
        request.abort();
    } else {
        request.continue();
    }
}
