// Real collections for local development and demos, curated from the
// namestarlit engineering toolkit. Every link is a public page; titles are
// resolved from the pages when the seed runs (the text here is the fallback).
// Items: ["h", heading] | ["l", url, fallbackTitle, tags?] | ["c", collectionSlug, tags?]

export type SeedItem = ["h", string] | ["l", string, string, string[]?] | ["c", string, string[]?];

export interface SeedCollection {
  key: string;
  title: string;
  description: string;
  published: boolean;
  items: SeedItem[];
}

export const seedHub = {
  handle: "namestarlit",
  userName: "namestarlit",
  hubName: "Engineering toolkit",
  description:
    "Resources for becoming a software engineer, gathered since 2023: how to think, what to read, and the references worth keeping open.",
};

export const seedCollections: SeedCollection[] = [
  {
    key: "thinking-like-an-engineer",
    title: "Thinking like an engineer",
    description:
      "Short reads on asking well, learning deliberately and deciding what matters. Start here before the technical guides.",
    published: true,
    items: [
      ["h", "Asking well"],
      ["l", "https://no-hello.com/", "No Hello", ["etiquette"]],
      ["l", "https://dontasktoask.com/", "Don't ask to ask", ["etiquette"]],
      ["l", "https://xyproblem.info/", "The XY Problem", ["problem-solving"]],
      ["l", "https://www.neverjust.net/", "Never just"],
      ["l", "https://grantslatton.com/nobody-cares", "Nobody cares", ["essay"]],
      ["h", "Learning how to learn"],
      [
        "l",
        "https://fs.blog/feynman-learning-technique/",
        "The Feynman Learning Technique",
        ["method"],
      ],
      [
        "l",
        "https://www.readynorth.com/blog/what-is-first-principles-thinking",
        "First principles thinking",
      ],
      [
        "l",
        "https://arxiv.org/abs/2506.08872",
        "Accumulation of Cognitive Debt when Using an AI Assistant for Essay Writing Task",
        ["paper", "ai"],
      ],
      ["h", "Choosing what matters"],
      [
        "l",
        "https://longform.asmartbear.com/specificity/",
        "Specificity: A weapon of mass effectiveness",
        ["essay"],
      ],
      ["l", "https://longform.asmartbear.com/focus/", "Focus", ["essay"]],
      ["l", "https://talks.natetucker.com/p/product-velocity", "Product Velocity", ["product"]],
      [
        "l",
        "https://www.seangoedecke.com/where-the-money-comes-from/",
        "Knowing where your engineer salary comes from",
        ["career"],
      ],
      ["c", "developer-reference-shelf", ["next"]],
    ],
  },
  {
    key: "developer-reference-shelf",
    title: "Developer reference shelf",
    description:
      "Free references and learning paths worth keeping a tab open for. No account needed for any of them.",
    published: true,
    items: [
      ["h", "Learning paths"],
      ["l", "https://roadmap.sh/", "Developer Roadmaps", ["roadmap"]],
      ["l", "https://www.theodinproject.com/", "The Odin Project", ["course"]],
      ["l", "https://techdevguide.withgoogle.com/", "Google Tech Dev Guide", ["course"]],
      ["l", "https://thevalleyofcode.com/", "The Valley of Code"],
      ["h", "Quick references"],
      ["l", "https://devdocs.io/", "DevDocs Documentation", ["docs"]],
      ["l", "https://devhints.io/", "Devhints Cheatsheets", ["cheatsheet"]],
      ["l", "https://learnxinyminutes.com/", "Learn X in Y Minutes", ["cheatsheet"]],
      ["h", "Reading and writing"],
      ["l", "https://practicaltypography.com/", "Butterick's Practical Typography", ["book"]],
      ["l", "https://freecomputerbooks.com/", "Free Computer Books", ["books"]],
      ["l", "https://commitmono.com/", "CommitMono Font", ["font"]],
    ],
  },
  {
    key: "code-style-and-conventions",
    title: "Code style and conventions",
    description:
      "Linters, formatters and conventions by language, plus the repository habits that keep a codebase easy to work in.",
    published: true,
    items: [
      ["h", "Shell"],
      ["l", "https://github.com/koalaman/shellcheck", "ShellCheck", ["linter"]],
      [
        "l",
        "https://www.cyberciti.biz/tips/finding-bash-perl-python-portably-using-env.html",
        "#!/usr/bin/env as a shebang",
      ],
      ["h", "Python"],
      ["l", "https://docs.astral.sh/ruff/", "Ruff - Python Linter", ["linter"]],
      ["l", "https://github.com/psf/black", "Black", ["formatter"]],
      ["l", "https://pycqa.github.io/isort/", "isort", ["formatter"]],
      [
        "l",
        "https://mypy.readthedocs.io/en/stable/cheat_sheet_py3.html",
        "mypy type hints cheat sheet",
        ["types"],
      ],
      ["l", "https://docs.astral.sh/uv/", "uv - Python project manager", ["tooling"]],
      ["h", "JavaScript and SQL"],
      ["l", "https://standardjs.com/rules.html", "JavaScript Standard Style", ["style"]],
      ["l", "https://eslint.org/", "ESLint", ["linter"]],
      ["l", "https://jsdoc.app/", "JSDoc", ["docs"]],
      ["l", "https://www.sqlstyle.guide/", "SQL Style Guide", ["style"]],
      ["h", "Repository habits"],
      ["l", "https://www.conventionalcommits.org/en/v1.0.0/", "Conventional Commits", ["git"]],
      ["l", "https://semver.org/", "Semantic Versioning", ["releases"]],
      ["l", "https://editorconfig.org/", "EditorConfig"],
      ["l", "https://pre-commit.com/", "pre-commit", ["git"]],
      ["l", "https://github.com/matiassingers/awesome-readme", "Awesome READMEs", ["docs"]],
    ],
  },
  {
    key: "how-the-web-reaches-you",
    title: "How the web reaches you",
    description:
      "From typing an address to a page arriving: DNS, servers, load balancing and HTTPS, in the order a request meets them.",
    published: true,
    items: [
      [
        "l",
        "https://github.com/alex/what-happens-when",
        "What happens when you type google.com and press Enter",
        ["overview"],
      ],
      ["h", "1 · Names"],
      ["l", "https://howdns.works/", "How DNS works (a comic)", ["visual"]],
      ["l", "https://www.cloudflare.com/learning/dns/what-is-dns/", "What is DNS?"],
      ["l", "https://support.dnsimple.com/articles/a-record/", "What's an A record?", ["dns"]],
      ["l", "https://support.dnsimple.com/articles/ns-record/", "What's an NS record?", ["dns"]],
      ["h", "2 · Servers"],
      [
        "l",
        "https://developer.mozilla.org/en-US/docs/Learn/Common_questions/Web_mechanics/What_is_a_web_server",
        "What is a web server?",
        ["mdn"],
      ],
      [
        "l",
        "https://www.brendangregg.com/blog/2017-08-08/linux-load-averages.html",
        "Linux load averages: solving the mystery",
        ["deep-dive"],
      ],
      ["h", "3 · Scale and resilience"],
      [
        "l",
        "https://www.digitalocean.com/community/tutorials/an-introduction-to-haproxy-and-load-balancing-concepts",
        "An introduction to HAProxy and load-balancing concepts",
        ["load-balancing"],
      ],
      ["l", "https://en.wikipedia.org/wiki/Redundancy_(engineering)", "Redundancy (engineering)"],
      ["h", "4 · Secure delivery"],
      [
        "l",
        "https://en.wikipedia.org/wiki/TLS_termination_proxy",
        "TLS termination proxy",
        ["https"],
      ],
      [
        "l",
        "https://serversforhackers.com/c/letsencrypt-with-haproxy",
        "Let's Encrypt with HAProxy",
        ["https"],
      ],
      [
        "l",
        "https://www.digitalocean.com/community/tutorials/ufw-essentials-common-firewall-rules-and-commands",
        "UFW essentials: common firewall rules",
        ["firewall"],
      ],
      ["c", "backend-building-blocks", ["next"]],
    ],
  },
  {
    key: "backend-building-blocks",
    title: "Backend building blocks",
    description:
      "Data stores, API design, caching and authentication: the pieces most backend work is assembled from.",
    published: true,
    items: [
      ["h", "Storing data"],
      [
        "l",
        "https://www.liquidweb.com/kb/mysql-optimization-how-to-leverage-mysql-database-indexing/",
        "How to leverage MySQL database indexing",
        ["sql"],
      ],
      [
        "l",
        "https://www.mongodb.com/docs/manual/aggregation/",
        "MongoDB aggregation operations",
        ["nosql"],
      ],
      ["l", "https://realpython.com/python-redis/", "How to use Redis with Python", ["redis"]],
      ["l", "https://redis.io/commands/", "Redis commands", ["redis", "reference"]],
      ["h", "Designing APIs"],
      [
        "l",
        "https://www.moesif.com/blog/technical/api-design/REST-API-Design-Filtering-Sorting-and-Pagination/",
        "REST API design: filtering, sorting and pagination",
        ["api"],
      ],
      ["l", "https://en.wikipedia.org/wiki/HATEOAS", "HATEOAS", ["api"]],
      [
        "l",
        "https://www.rfc-editor.org/rfc/rfc9110.html#name-status-codes",
        "HTTP status codes (RFC 9110)",
        ["http", "reference"],
      ],
      ["h", "Caching"],
      [
        "l",
        "https://en.wikipedia.org/wiki/Cache_replacement_policies",
        "Cache replacement policies",
        ["caching"],
      ],
      ["l", "https://aws.amazon.com/caching/", "What is caching?", ["caching"]],
      ["h", "Authentication and personal data"],
      [
        "l",
        "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization",
        "The Authorization header",
        ["auth", "mdn"],
      ],
      [
        "l",
        "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cookie",
        "The Cookie header",
        ["auth", "mdn"],
      ],
      [
        "l",
        "https://piwik.pro/blog/what-is-pii-personal-data/",
        "What is PII, non-PII and personal data?",
        ["privacy"],
      ],
      ["l", "https://github.com/pyca/bcrypt/", "bcrypt", ["passwords"]],
    ],
  },
  {
    key: "accessibility-from-the-start",
    title: "Accessibility from the start",
    description:
      "Why accessibility is part of the work rather than a feature, how to check it, and who to keep reading.",
    published: true,
    items: [
      ["h", "Why it matters"],
      [
        "l",
        "https://ethanmarcotte.com/wrote/accessibility-is-not-a-feature/",
        "Accessibility is not a feature",
        ["essay"],
      ],
      [
        "l",
        "https://www.24a11y.com/2018/i-threw-away-my-mouse/",
        "I threw away my mouse",
        ["experience"],
      ],
      [
        "l",
        "https://www.24a11y.com/2018/i-used-a-switch-control-for-a-day/",
        "I used a switch control for a day",
        ["experience"],
      ],
      ["h", "Checking your work"],
      [
        "l",
        "https://www.w3.org/WAI/WCAG22/quickref/",
        "How to meet WCAG (quick reference)",
        ["reference"],
      ],
      [
        "l",
        "https://www.gov.uk/service-manual/technology/testing-with-assistive-technologies",
        "Testing with assistive technologies (GOV.UK)",
        ["testing"],
      ],
      ["l", "https://a11y-style-guide.com/style-guide/", "A11Y Style Guide", ["patterns"]],
      ["h", "Keep reading"],
      ["l", "https://www.deque.com/blog/", "Deque accessibility blog", ["blog"]],
      ["l", "https://tink.uk/", "Tink — Léonie Watson", ["blog"]],
      ["l", "https://a11yweekly.com/", "Accessibility Weekly", ["newsletter"]],
    ],
  },
];
