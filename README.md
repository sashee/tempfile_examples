# tempfile_examples

## Prerequisites

* npm
* ghostscript (```gs --version```)

## Usage

* ```npm ci```
* ```npm run run```
* go to http://localhost:3000

## Functionality

1) Check the sitemap, it's using a component that crawles the site and writes the XML into a temp file.
2) Upload a PDF and watch how Ghostscript extracts the first page as a PNG. Under the hood, it writes the images into a temp directory
