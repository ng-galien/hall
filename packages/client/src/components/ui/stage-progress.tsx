import { defineStepper } from "@stepperize/react";
import type { ReactNode } from "react";
import { CheckIcon } from "../icons";

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
  }: {
    currentStep: string;
    completedSteps?: string[];
    labels: readonly string[];
    label: string;
    testId: string;
    stepTestIdPrefix?: string;
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
                <div className="meeting-stepper-marker">
                  <Stepper.Indicator className="meeting-stepper-indicator">
                    <span className="meeting-stepper-icon" aria-hidden="true">
                      {step.icon}
                    </span>
                    <CheckIcon className="meeting-stepper-check" aria-hidden="true" />
                  </Stepper.Indicator>
                  {index < steps.length - 1 ? <Stepper.Separator className="meeting-stepper-separator" /> : null}
                </div>
                <Stepper.Title className="meeting-stepper-title">{labels[index]}</Stepper.Title>
              </Stepper.Item>
            )}
          </Stepper.Items>
        </Stepper.List>
      </Stepper.Root>
    );
  };
}
