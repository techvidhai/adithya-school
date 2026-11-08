import { googleGet, readContent } from "./google.mjs";
import layoutTemplate from "./pages/layout.html";
import homeTemplate from "./pages/index.html";
import facultyTemplate from "./pages/faculty.html";
import facultyCardTemplate from "./pages/faculty-card.html";
import profileTemplate from "./pages/faculty-profile.html";
import galleryTemplate from "./pages/gallery.html";
import galleryCardTemplate from "./pages/gallery-card.html";

const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => entities[char]);
const validId = value => /^[A-Za-z0-9_-]{1,128}$/.test(value ?? "");
const published = value => value.toLowerCase() === "true";
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

function render(template, slots) {
  return template.replace(/\{\{([a-z]+)\}\}/g, (marker, key) => {
    if (!Object.hasOwn(slots, key)) throw new Error("Unknown HTML template placeholder: " + marker);
    return slots[key];
  });
}

function page(title, content, status = 200) {
  return new Response(render(layoutTemplate, { title: escape(title), content }), {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'self'; base-uri 'none'; frame-ancestors 'none'"
    }
  });
}

function section(title, body) {
  return `<section class="wrap section"><h1>${escape(title)}</h1>${body}</section>`;
}

function home(site) {
  return page("Home", render(homeTemplate, {
    tagline: escape(site.tagline),
    about: escape(site.about || "School information will be available here."),
    admissions: escape(site.admissions || "Admissions information will be available here."),
    contact: escape(site.contact || "Contact information will be available here.")
  }));
}

function photo(fileId, kind, id, alt) {
  return validId(fileId)
    ? `<img src="/media/${kind}/${id}" alt="${escape(alt)}" loading="lazy">`
    : "";
}

function facultyList(faculty) {
  const cards = faculty.map(person => render(facultyCardTemplate, {
    id: person["Faculty ID"],
    photo: photo(person["Photo File ID"], "faculty", person["Faculty ID"], ""),
    name: escape(person.Name),
    designation: escape(person.Designation),
    department: escape(person.Department),
    qualification: escape(person.Qualification)
  })).join("");
  return page("Faculty", render(facultyTemplate, {
    directory: cards ? `<ul class="grid">${cards}</ul>` : "<p>Faculty profiles will be available here.</p>"
  }));
}

function profile(person) {
  const details = ["Designation", "Department", "Qualification", "Experience", "Specialization", "Subjects", "Awards"]
    .filter(field => person[field])
    .map(field => `<dt>${field}</dt><dd>${escape(person[field])}</dd>`).join("");
  return page(person.Name, render(profileTemplate, {
    name: escape(person.Name),
    photo: photo(person["Photo File ID"], "faculty", person["Faculty ID"], person.Name),
    details,
    biography: person.Biography ? `<h2>Biography</h2><p>${escape(person.Biography)}</p>` : ""
  }));
}

function galleryPage(items) {
  const cards = items.map(item => render(galleryCardTemplate, {
    photo: photo(item["Drive File ID"], "gallery", item["Image ID"], item.Description || item.Title),
    title: escape(item.Title),
    description: escape(item.Description)
  })).join("");
  return page("Gallery", render(galleryTemplate, {
    gallery: cards ? `<ul class="grid">${cards}</ul>` : "<p>School photos will be available here.</p>"
  }));
}

const missing = () => page("Page unavailable", section("Page unavailable", '<p><a href="/">Return to the school home page</a></p>'), 404);

async function media(fileId, env) {
  if (!validId(fileId)) return missing();
  const response = await googleGet("https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media", env);
  const type = response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (!response.ok || !imageTypes.has(type)) {
    await response.body?.cancel();
    return missing();
  }
  return new Response(response.body, {
    headers: { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}

function uniqueById(entries, key) {
  const ids = new Set();
  const duplicates = new Set();
  for (const entry of entries) {
    const id = entry[key];
    if (ids.has(id)) duplicates.add(id);
    ids.add(id);
  }
  return entries.filter(entry => validId(entry[key]) && !duplicates.has(entry[key]));
}

export default {
  async fetch(request, env) {
    if (!["GET", "HEAD"].includes(request.method)) {
      return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
    const detail = path.match(/^\/faculty\/([A-Za-z0-9_-]{1,128})$/);
    const image = path.match(/^\/media\/(faculty|gallery)\/([A-Za-z0-9_-]{1,128})$/);
    if (!["/", "/faculty", "/gallery"].includes(path) && !detail && !image) {
      const response = missing();
      return request.method === "HEAD" ? new Response(null, response) : response;
    }

    let response;
    try {
      const content = await readContent(env);
      const faculty = uniqueById(content.faculty, "Faculty ID")
        .filter(person => person.Name && person.Status.toLowerCase() === "working" && published(person.Published));
      const gallery = uniqueById(content.gallery, "Image ID")
        .filter(item => published(item.Published) && validId(item["Drive File ID"]));

      if (path === "/") response = home(content.site);
      else if (path === "/faculty") response = facultyList(faculty);
      else if (path === "/gallery") response = galleryPage(gallery);
      else if (detail) {
        const person = faculty.find(entry => entry["Faculty ID"] === detail[1]);
        response = person ? profile(person) : missing();
      } else {
        const fileId = image[1] === "faculty"
          ? faculty.find(person => person["Faculty ID"] === image[2])?.["Photo File ID"]
          : gallery.find(item => item["Image ID"] === image[2])?.["Drive File ID"];
        response = await media(fileId, env);
      }
    } catch {
      response = page("Temporarily unavailable", section("Temporarily unavailable",
        "<p>We couldn't load the latest school information. Please try again shortly.</p>"), 503);
    }
    if (request.method === "HEAD") {
      await response.body?.cancel();
      return new Response(null, { status: response.status, headers: response.headers });
    }
    return response;
  }
};
