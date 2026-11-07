import { defineStepper } from "@stepperize/react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CheckIcon, PlayIcon } from "../icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

interface ProgressStep {
  id: string;
  icon: ReactNode;
}

/** Shared read-only step presentation; callers provide the current and completed steps. */
export function createStageProgress(steps: readonly ProgressStep[]) {
  const { Stepper } = defineStepper(steps);
  return function StageProgress({
    currentStep,
    completedSteps,
    labels,
    label,
    testId,
    stepTestIdPrefix = testId,
    advance,
    hints,
  }: {
    currentStep: string;
    completedSteps?: string[];
    labels: readonly string[];
    label: string;
    testId: string;
    stepTestIdPrefix?: string;
    /** The step the user can enter from here: a link, or a disabled marker with its reason. */
    advance?: { step: string; to: string; label: string; testId: string; disabled?: boolean; describedBy?: string };
    /** One explanation per step, shown on hover: what happens there. */
    hints?: readonly string[];
  }) {
    const currentIndex = steps.findIndex((step) => step.id === currentStep);
    const completed = completedSteps ?? steps.slice(0, currentIndex).map((step) => step.id);
    return (
      <Stepper.Root step={currentStep} completed={completed} className="meeting-stepper" data-testid={testId}>
        <Stepper.List role="list" className="meeting-stepper-list" aria-label={label}>
          <Stepper.Items>
            {(step, index) => (
              <Stepper.Item
                step={step.id}
                role="listitem"
                aria-current={step.id === currentStep ? "step" : undefined}
                data-completed={completed.includes(step.id) || undefined}
                className="meeting-stepper-item"
                data-testid={`${stepTestIdPrefix}-${index + 1}`}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="meeting-stepper-marker">
                      {advance && advance.step === step.id ? (
                        advance.disabled ? (
                          <span
                            className="meeting-stepper-indicator meeting-stepper-advance"
                            data-disabled="true"
                            data-testid={advance.testId}
                            aria-disabled="true"
                            aria-describedby={advance.describedBy}
                            title={advance.label}
                          >
                            <PlayIcon aria-hidden="true" />
                          </span>
                        ) : (
                          <Link
                            className="meeting-stepper-indicator meeting-stepper-advance"
                            to={advance.to}
                            data-testid={advance.testId}
                            aria-label={advance.label}
                            title={advance.label}
                          >
                            <PlayIcon aria-hidden="true" />
                          </Link>
                        )
                      ) : (
                        <Stepper.Indicator className="meeting-stepper-indicator">
                          <span className="meeting-stepper-icon" aria-hidden="true">
                            {step.icon}
                          </span>
                          <CheckIcon className="meeting-stepper-check" aria-hidden="true" />
                        </Stepper.Indicator>
                      )}
                      {index < steps.length - 1 ? <Stepper.Separator className="meeting-stepper-separator" /> : null}
                    </div>
                  </TooltipTrigger>
                  {hints?.[index] ? (
                    <TooltipContent side="bottom" className="meeting-stepper-hint">
                      <strong>{labels[index]}</strong>
                      <span>{hints[index]}</span>
                    </TooltipContent>
                  ) : null}
                </Tooltip>
                <Stepper.Title className="meeting-stepper-title">{labels[index]}</Stepper.Title>
              </Stepper.Item>
            )}
          </Stepper.Items>
        </Stepper.List>
      </Stepper.Root>
    );
  };
}
