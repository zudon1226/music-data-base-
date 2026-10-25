"use client";

import {
    PUBLIC_BETA_SUBSCRIPTION_HOME_HEADING,
    PUBLIC_BETA_SUBSCRIPTION_HOME_INTRO,
    PUBLIC_BETA_SUBSCRIPTION_HOME_NOTICE_BODY,
    PUBLIC_BETA_SUBSCRIPTION_HOME_NOTICE_TITLE,
    PUBLIC_BETA_SUBSCRIPTION_HOME_SIGNUP_BODY,
    PUBLIC_BETA_SUBSCRIPTION_HOME_SIGNUP_BUTTON,
    PUBLIC_BETA_SUBSCRIPTION_HOME_SIGNUP_TITLE,
    PUBLIC_BETA_SUBSCRIPTION_HOME_SUBHEADING,
    PUBLIC_BETA_VERIFIED_REGISTRATION_ROUTE,
} from "@/lib/public-beta-subscription-home-content";
import "./public-beta-free-signup-section.css";

type Props = {
    onSignUpFree: () => void;
};

export function PublicBetaFreeSignupSection({ onSignUpFree }: Props) {
    return (
        <section
            className="subscription-section public-beta-free-signup-section"
            aria-label="Public beta free signup"
            data-public-beta-subscription-home="true"
        >
            <div className="subscription-head">
                <p className="section-kicker">Public beta</p>
                <h2>{PUBLIC_BETA_SUBSCRIPTION_HOME_HEADING}</h2>
                <p className="public-beta-free-signup-subheading">{PUBLIC_BETA_SUBSCRIPTION_HOME_SUBHEADING}</p>
            </div>

            <p className="public-beta-free-signup-intro">{PUBLIC_BETA_SUBSCRIPTION_HOME_INTRO}</p>

            <article className="public-beta-free-signup-card">
                <h3>{PUBLIC_BETA_SUBSCRIPTION_HOME_SIGNUP_TITLE}</h3>
                <p>{PUBLIC_BETA_SUBSCRIPTION_HOME_SIGNUP_BODY}</p>
                <button
                    type="button"
                    className="public-beta-free-signup-primary"
                    data-registration-route={PUBLIC_BETA_VERIFIED_REGISTRATION_ROUTE}
                    onClick={onSignUpFree}
                >
                    {PUBLIC_BETA_SUBSCRIPTION_HOME_SIGNUP_BUTTON}
                </button>
            </article>

            <p className="public-beta-free-signup-notice" role="note">
                <strong>{PUBLIC_BETA_SUBSCRIPTION_HOME_NOTICE_TITLE}</strong>
                <span>{PUBLIC_BETA_SUBSCRIPTION_HOME_NOTICE_BODY}</span>
            </p>
        </section>
    );
}
