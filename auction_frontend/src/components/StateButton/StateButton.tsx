import { ReactFormState } from 'react-dom/client';
import styles from './StateButton.module.css';
import { FC } from 'react';

interface StateButtonProps {
  text: string;
  onClick?: () => void;
}

const StateButton: FC<StateButtonProps> = ({text, onClick}) => {
    return(
        <div className={styles.state_button} onClick={onClick}>
            {text}
        </div>
    )
}

export default StateButton