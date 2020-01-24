const getPort = require("get-port");
const http = require("http");
const tempy = require("tempy");
const rimraf = require("rimraf");
const util = require("util");
const sitemapGenerator = require("sitemap-generator");
const fs = require("fs");
const {spawn} = require("child_process");
const multer = require("multer");

const withTempFile = async (fn) => {
	const file = tempy.file();
	try {
		return await fn(file);
	}finally {
		await util.promisify(rimraf)(file);
	}
};

const withTempDir = async (fn) => {
	const dir = tempy.directory();
	try {
		return await fn(dir);
	}finally {
		await util.promisify(rimraf)(dir);
	}
};

const getSitemap = async () => {
	return await withTempFile(async (file) => {
		await new Promise((res, rej) => {
			const generator = sitemapGenerator("http://localhost:3000/", {
				filepath: file,
			});

			generator.on("done", res);
			generator.on("error", rej);

			generator.start();
		});

		return await util.promisify(fs.readFile)(file, "utf8");
	});
};

const pdfToImage = async (pdf) => {
	return withTempDir(async (tmpDir) => {
		await new Promise((res, rej) => {
			const child = spawn("gs", ["-q", "-sDEVICE=png16m", "-o", `${tmpDir}/%d.png`,  "-r300", "-"], {stdio: ["pipe", "pipe", "pipe"]});

			child.stdin.write(pdf);
			child.stdin.end();
			child.on("exit", () => {
				res();
			});
			child.stderr.on("data", (data) => {
				rej(data);
			});
		});

		const files = await util.promisify(fs.readdir)(tmpDir);
		return Promise.all(files.sort(new Intl.Collator(undefined, {numeric: true}).compare).map((filename) => util.promisify(fs.readFile)(`${tmpDir}/${filename}`)));
	});
};

const app = http.createServer(async (req, res) => {
	try {
		const path = req.url.match("^[^?]*")[0];
		if (path === "/") {
			res.setHeader("Content-Type", "text/html");
			res.writeHead(200);
			res.end(`
<html>
	<body>
		<h1>main page</h1>
		<a href="/page1">page 1</a>
		<h2>Sitemap generator (tempfile)</h2>
		<a rel="nofollow" href="sitemap.xml">Sitemap</a>
		<h2>PDF upload form (temp dir)</h2>
		<form action="pdf_1.png" method="post" enctype="multipart/form-data">
			Upload a PDF file:
			<input type="file" name="pdf" accept="application/pdf">
			<input type="submit" value="Get first page">
		</form>
	</body>
</html>
			`);
		}else if (path === "/page1") {
			res.setHeader("Content-Type", "text/html");
			res.writeHead(200);
			res.end("<html><body><h1>page 1</h1><a href=\"/\">main page</a></body></html>");
		}else if (path === "/sitemap.xml") {
			const sitemap = await getSitemap();
			res.setHeader("Content-Type", "text/plain");
			res.writeHead(200);
			res.end(sitemap);
		}else if (path === "/pdf_1.png" && req.method === "POST") {
			await util.promisify(multer({storage: multer.memoryStorage()}).single("pdf"))(req, res);
			const pdf = req.file.buffer;
			const images = await pdfToImage(pdf);

			res.setHeader("Content-Type", "image/png");
			res.writeHead(200);
			res.end(images[0]);
		}else {
			res.writeHead(404);
			res.end();
		}

	}catch(e) {
		res.statusCode = 500;
		console.error(e);
		res.end(e.stack);
	}
});

app.listen(3000);

console.log("app listens on http://localhost:3000");
