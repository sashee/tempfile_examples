const http = require("http");
const {promisify} = require("util");
const sitemapGenerator = require("sitemap-generator");
const {spawn} = require("child_process");
const multer = require("multer");
const fs = require("fs").promises;
const os = require("os");
const path = require("path");

const getPermissions = async (path) => {
	const stats = await fs.stat(path);
	return "0" + (stats.mode & parseInt("777", 8)).toString(8);
};

const withTempFile = (fn) => withTempDir((dir) => fn(path.join(dir, "file")));

const withTempDirProm = (fn) => fs.realpath(os.tmpdir())
	.then((tmp) => fs.mkdtemp(tmp + path.sep))
	.then((dir) => fn(dir)
		.finally(() => fs.rmdir(dir, {recursive: true}))
	);

const withTempDir = async (fn) => {
	const dir = await fs.mkdtemp(await fs.realpath(os.tmpdir()) + path.sep);
	try {
		return await fn(dir);
	}finally {
		fs.rmdir(dir, {recursive: true});
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

		return await fs.readFile(file, "utf8");
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

		const files = await fs.readdir(tmpDir);
		return Promise.all(files.sort(new Intl.Collator(undefined, {numeric: true}).compare).map((filename) => fs.readFile(`${tmpDir}/${filename}`)));
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
			await promisify(multer({storage: multer.memoryStorage()}).single("pdf"))(req, res);
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
