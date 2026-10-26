<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

Copy `.env.example` to `.env` and set `MONGODB_URI` and a long random `JWT_SECRET`.
For password recovery, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASSWORD`, and `FRONTEND_URL`. `EMAIL_FROM` is optional; when omitted, the
SMTP username is used as the sender address. For Gmail, use `smtp.gmail.com`,
port `587`, your Gmail address, and a Google app password. The six-digit reset
code expires after 10 minutes. SMTP credentials belong only in the backend
environment and must never be exposed in the frontend.

The authentication API includes:

- `POST /api/auth/signup` — creates a partner account with an active partner code; the user must sign in afterward.
- `POST /api/auth/login` — returns a JWT.
- `POST /api/auth/forgot-password` — emails a six-digit code that expires after 10 minutes.
- `POST /api/auth/verify-reset-code` — verifies the emailed code and returns a short-lived, single-use reset token.
- `POST /api/auth/reset-password` — consumes the verified reset token and sets a new password.
- `POST /api/auth/update-password` — changes the signed-in user's password; requires a bearer token.

New passwords must be exactly six letters and/or digits (no spaces or symbols) for
signup, reset, and password changes. Login continues to accept existing account
passwords so seeded or previously configured credentials remain usable.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deploy on Vercel

Deploy this backend as a **separate Vercel project** with this directory as its
project root. The `api/[...path].ts` serverless function hosts the Nest/Express
application; public API routes retain the `/api` prefix. Use `npm run build` as
the build command and leave the Output Directory unset.

Create a MongoDB Atlas database and configure Atlas network access for the
deployed backend. In the backend Vercel project's Production environment, set:

- `MONGODB_URI` — the Atlas connection string.
- `JWT_SECRET` — a long, randomly generated secret.
- `MASTER_EMAIL` and `MASTER_PASSWORD` — the production master login.
- `FRONTEND_URL` — the frontend's deployed HTTPS origin, without a path.
- `CORS_ORIGINS` — comma-separated allowed frontend origins. Add the production
  origin and any Preview origins that should be allowed.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASSWORD` — mail provider
  settings. For Gmail, use `smtp.gmail.com`, port `587`, a Gmail address, and a
  Google app password. `EMAIL_FROM` is optional; if omitted, `SMTP_USER` is used.

Vercel deployments do not read your local `.env`. Add values in Vercel's
Environment Variables settings; never commit or paste secrets into source code.
Do not use the sample local master credentials for production. A new production
database seeds the configured master account and does not seed the local demo
partner login by default. Existing database accounts are not overwritten.

Deploy the frontend separately with `kredo-platform` as its project root. Set
its `NEXT_PUBLIC_API_URL` to `https://<backend-domain>/api` in the frontend
Vercel project and redeploy it. Verify that both frontend and backend are
available over HTTPS, then test login, signup, CORS-protected API calls, and
email-based password recovery.

## Deploy to an Ubuntu/Debian VPS (without Docker)

The `deploy.sh` script installs Node.js 22, PM2, Nginx, and Certbot; builds the
API; configures PM2 to restart it at boot; proxies both
`kred-backend.omnisuiteai.com` and `www.kred-backend.omnisuiteai.com` to port
`5099`; and requests a Let's Encrypt certificate. It must be run from this
backend project directory on the VPS with sudo access.

Before running it:

1. Point both hostnames' DNS A records to the VPS IPv4 address. Allow inbound
   ports 80 and 443 in the VPS/cloud firewall; port 5099 is only used locally
   behind Nginx.
2. Create `.env` from `.env.example` and set production values for `MONGODB_URI`
   (a reachable production MongoDB), `JWT_SECRET`, `MASTER_EMAIL`, and
   `MASTER_PASSWORD`. Set `FRONTEND_URL` and `CORS_ORIGINS` to the deployed
   **frontend** origin(s), not the backend API hostname. Configure SMTP
   variables if password reset emails are required.
3. Run `sudo sh deploy.sh` from this directory and enter an email address for
   Let's Encrypt when prompted.

The script does not overwrite the existing `.env`. To deploy updates, upload the
new source, then run `sudo sh deploy.sh` again. Check service output with
`pm2 logs kredo-portal-backend` and verify
`https://kred-backend.omnisuiteai.com/api/portal/health`.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

To add it to this project, run this and approve the code it prints at [observe.nestjs.com/link](https://observe.nestjs.com/link) - signing up for free if you have no account:

```bash
$ npx @nestjs/observe link
```

It installs `@nestjs/observe`, wires it into `AppModule` and `main.ts`, and writes the app key and secret into `.env`, which every `nest start` script (`start`, `start:dev`, `start:debug`) then loads. In production, set `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in the environment instead.

Or do it by hand:

```bash
$ npm install @nestjs/observe
```

Then follow the [setup guide](https://docs.nestjs.com/observability/sdk) - it takes a single import and an app key.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
